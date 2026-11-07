"""Google Trends forecasting prototype for CityPulse."""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, timedelta
import json
import argparse
import unicodedata
from pathlib import Path
from typing import Sequence

import numpy as np
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error


@dataclass(frozen=True)
class TrendPoint:
    """One observed or forecast daily interest value."""

    day: date
    interest: float


@dataclass(frozen=True)
class ForecastResult:
    """Forecast output and metrics needed by downstream CityPulse services."""

    forecast: list[TrendPoint]
    validation_mae: float
    validation_rmse: float
    peak_day: date
    peak_interest: float
    arbitrage_day: date
    best_next_7_days: date
    interval_days: int


@dataclass(frozen=True)
class CityTrendSelection:
    """The CityPulse city selected from Google Trends regional interest."""

    city_id: str
    city: str
    interest: float
    source: str


def _normalise_name(value: str) -> str:
    """Make city names comparable when accents or punctuation differ."""
    without_accents = "".join(
        character
        for character in unicodedata.normalize("NFKD", value)
        if not unicodedata.combining(character)
    )
    return "".join(character for character in without_accents.casefold() if character.isalnum())


def select_trending_city(
    keywords: Sequence[str],
    cities_path: str | Path = "data/ro_cities.json",
    timeframe: str = "today 12-m",
    category: int = 0,
) -> CityTrendSelection:
    """Select the highest-interest CityPulse city from Google Trends.

    Google Trends may omit low-volume cities. If none of the configured cities
    is returned, Bucharest is selected explicitly as a deterministic fallback.
    """
    cleaned_keywords = [keyword.strip() for keyword in keywords if keyword.strip()]
    if not 1 <= len(cleaned_keywords) <= 3:
        raise ValueError("provide between 1 and 3 non-empty keywords")

    try:
        from pytrends.request import TrendReq
    except ImportError as error:
        raise RuntimeError(
            "pytrends is required; install dependencies with "
            "`python -m pip install -r requirements.txt`"
        ) from error

    with Path(cities_path).open(encoding="utf-8") as cities_file:
        cities = json.load(cities_file)
    if not isinstance(cities, list) or not cities:
        raise ValueError("cities file must contain at least one city")

    trends = TrendReq(hl="ro-RO", tz=120, retries=2, backoff_factor=0.2)
    trends.build_payload(
        kw_list=cleaned_keywords,
        cat=category,
        timeframe=timeframe,
        geo="RO",
        gprop="",
    )
    regional_data = trends.interest_by_region(
        resolution="CITY",
        inc_low_vol=True,
        inc_geo_code=False,
    )
    city_lookup = {
        _normalise_name(str(city["name"])): city
        for city in cities
        if isinstance(city, dict) and city.get("name") and city.get("id")
    }
    candidates: list[CityTrendSelection] = []
    for region_name, row in regional_data.iterrows():
        city = city_lookup.get(_normalise_name(str(region_name)))
        if city is None:
            continue
        interest = float(row[cleaned_keywords].mean())
        candidates.append(
            CityTrendSelection(
                city_id=str(city["id"]),
                city=str(city["name"]),
                interest=interest,
                source="Google Trends city interest",
            )
        )

    if candidates:
        return max(candidates, key=lambda candidate: (candidate.interest, candidate.city))

    fallback = cities[0]
    return CityTrendSelection(
        city_id=str(fallback["id"]),
        city=str(fallback["name"]),
        interest=0.0,
        source="CityPulse fallback: no matching Google Trends city data",
    )


def select_requested_city(
    city_name: str,
    cities_path: str | Path = "data/ro_cities.json",
) -> CityTrendSelection:
    """Resolve a city supplied at runtime without changing source code."""
    requested_name = _normalise_name(city_name)
    with Path(cities_path).open(encoding="utf-8") as cities_file:
        cities = json.load(cities_file)
    for city in cities:
        if _normalise_name(str(city.get("name", ""))) == requested_name:
            return CityTrendSelection(
                city_id=str(city["id"]),
                city=str(city["name"]),
                interest=0.0,
                source="User-selected city",
            )
    available = ", ".join(str(city["name"]) for city in cities)
    raise ValueError(f"Unknown city {city_name!r}. Choose one of: {available}")


def fetch_google_trends(
    keywords: Sequence[str],
    timeframe: str = "today 12-m",
    geo: str = "RO",
    category: int = 0,
) -> list[TrendPoint]:
    """Fetch daily Romanian Google Trends interest for up to three keywords."""
    cleaned_keywords = [keyword.strip() for keyword in keywords if keyword.strip()]
    if not 1 <= len(cleaned_keywords) <= 3:
        raise ValueError("provide between 1 and 3 non-empty keywords")

    try:
        from pytrends.request import TrendReq
    except ImportError as error:
        raise RuntimeError(
            "pytrends is required; install dependencies with "
            "`python -m pip install -r requirements.txt`"
        ) from error

    trends = TrendReq(hl="ro-RO", tz=120, retries=2, backoff_factor=0.2)
    trends.build_payload(
        kw_list=cleaned_keywords,
        cat=category,
        timeframe=timeframe,
        geo=geo,
        gprop="",
    )
    data = trends.interest_over_time()
    if data.empty:
        raise RuntimeError(
            f"Google Trends returned no data for {cleaned_keywords!r} "
            f"with timeframe={timeframe!r} and geo={geo!r}"
        )

    interest_columns = [keyword for keyword in cleaned_keywords if keyword in data]
    if not interest_columns:
        raise RuntimeError("Google Trends response did not contain keyword columns")

    points: list[TrendPoint] = []
    for timestamp, row in data[interest_columns].iterrows():
        points.append(
            TrendPoint(
                day=timestamp.date(),
                interest=float(row.mean()),
            )
        )
    return points


def _macd(values: Sequence[float], fast: int = 5, slow: int = 12) -> float:
    """Return a lightweight MACD-style momentum value for the latest point."""
    if len(values) < slow:
        return 0.0
    fast_mean = float(np.mean(values[-fast:]))
    slow_mean = float(np.mean(values[-slow:]))
    return fast_mean - slow_mean


def _features(values: Sequence[float], lags: int) -> np.ndarray:
    """Build lag, rolling, first/second derivative, and MACD features."""
    if len(values) < lags:
        raise ValueError("history is shorter than the requested lag window")
    recent = list(values[-lags:])
    first_derivative = recent[-1] - recent[-2] if len(recent) > 1 else 0.0
    second_derivative = (
        recent[-1] - (2 * recent[-2]) + recent[-3]
        if len(recent) > 2
        else 0.0
    )
    return np.array(
        recent
        + [
            float(np.mean(recent)),
            float(np.std(recent)),
            first_derivative,
            second_derivative,
            _macd(recent),
        ],
        dtype=float,
    )


def _training_data(values: Sequence[float], lags: int) -> tuple[np.ndarray, np.ndarray]:
    """Turn a time series into supervised lag-feature rows."""
    x_rows = [_features(values[:index], lags) for index in range(lags, len(values))]
    y_rows = [float(values[index]) for index in range(lags, len(values))]
    return np.vstack(x_rows), np.array(y_rows, dtype=float)


def forecast_trend(
    history: Sequence[TrendPoint],
    horizon: int = 14,
    lags: int = 14,
    validation_days: int = 28,
    alpha: float = 1.0,
) -> ForecastResult:
    """Forecast future interest with Ridge and report a time-ordered holdout score."""
    if horizon < 1:
        raise ValueError("horizon must be positive")
    if validation_days < 1 or len(history) <= lags + validation_days:
        raise ValueError("history is too short for the requested validation window")

    values = [point.interest for point in history]
    intervals = [
        (current.day - previous.day).days
        for previous, current in zip(history, history[1:])
    ]
    interval_days = max(1, round(float(np.median(intervals))))
    x_all, y_all = _training_data(values, lags)
    split = len(x_all) - validation_days
    validation_model = Ridge(alpha=alpha)
    validation_model.fit(x_all[:split], y_all[:split])
    validation_predictions = validation_model.predict(x_all[split:])
    mae = float(mean_absolute_error(y_all[split:], validation_predictions))
    rmse = float(np.sqrt(mean_squared_error(y_all[split:], validation_predictions)))

    model = Ridge(alpha=alpha)
    model.fit(x_all, y_all)
    rolling_values = values.copy()
    forecast: list[TrendPoint] = []
    for offset in range(1, horizon + 1):
        prediction = min(
            100.0,
            max(
                0.0,
                float(model.predict(_features(rolling_values, lags).reshape(1, -1))[0]),
            ),
        )
        forecast_day = history[-1].day + timedelta(days=offset * interval_days)
        forecast.append(TrendPoint(forecast_day, prediction))
        rolling_values.append(prediction)

    peak = max(forecast, key=lambda point: point.interest)
    def opportunity_score(index: int, point: TrendPoint) -> float:
        previous_interest = history[-1].interest if index == 0 else forecast[index - 1].interest
        momentum = max(0.0, point.interest - previous_interest)
        estimated_cpm = max(1.0, 22.0 - (0.06 * point.interest) + (2.0 * np.sin(index / 3)))
        return (point.interest + (2.0 * momentum)) / estimated_cpm

    arbitrage = max(
        enumerate(forecast),
        key=lambda item: (opportunity_score(item[0], item[1]), item[1].day),
    )[1]
    next_week = [
        point for point in forecast
        if point.day <= history[-1].day + timedelta(days=7)
    ]
    best_next_7_days = max(
        next_week or forecast,
        key=lambda point: point.interest,
    )
    return ForecastResult(
        forecast=forecast,
        validation_mae=mae,
        validation_rmse=rmse,
        peak_day=peak.day,
        peak_interest=peak.interest,
        arbitrage_day=arbitrage.day,
        best_next_7_days=best_next_7_days.day,
        interval_days=interval_days,
    )


def _text_report(payload: dict[str, object]) -> str:
    """Render a compact human-readable report for non-JSON output."""
    forecast = payload["forecast"]
    lines = [
        f"Source: {payload['source']}",
        f"Keywords: {', '.join(payload['keywords'])}",
        f"Region: {payload['geo']}",
        f"Timeframe: {payload['timeframe']}",
        f"History points: {payload['history_days']}",
        f"Data interval: every {payload['interval_days']} day(s)",
        f"Validation MAE: {payload['validation_mae']}",
        f"Validation RMSE: {payload['validation_rmse']}",
        f"Forecast peak: {payload['peak_day']} ({payload['peak_interest']:.2f})",
        f"Best next 7 days: {payload['best_next_7_days']}",
        f"Advertising opportunity: {payload['arbitrage_day']}",
        "",
        "Forecast:",
    ]
    lines.extend(
        f"  {point['day']}: interest={point['interest']:.2f}" for point in forecast
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    """Fetch real Google Trends data and save the forecast report."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("keywords", nargs="+", help="one to three product keywords")
    parser.add_argument("--timeframe", default="today 12-m")
    parser.add_argument("--geo", default="RO", help="Google region code, default: RO")
    parser.add_argument(
        "--city",
        help="city from data/ro_cities.json; omit to select automatically",
    )
    parser.add_argument(
        "--output",
        default="coffee_daily_forecast.json",
        help=(
            "report path; existing files are overwritten (default: "
            "coffee_daily_forecast.json)"
        ),
    )
    args = parser.parse_args()

    selected_city = (
        select_requested_city(args.city)
        if args.city
        else select_trending_city(args.keywords)
    )
    history = fetch_google_trends(args.keywords, timeframe=args.timeframe, geo=args.geo)
    result = forecast_trend(history)
    payload = {
        "source": "Google Trends",
        "keywords": [keyword.strip() for keyword in args.keywords],
        "geo": args.geo,
        "timeframe": args.timeframe,
        "selected_city": asdict(selected_city),
        "history_days": len(history),
        "history": [
            {"day": point.day.isoformat(), "interest": round(point.interest, 2)}
            for point in history
        ],
        **asdict(result),
    }
    payload["forecast"] = [
        {"day": point.day.isoformat(), "interest": round(point.interest, 2)}
        for point in result.forecast
    ]
    payload["peak_day"] = result.peak_day.isoformat()
    payload["arbitrage_day"] = result.arbitrage_day.isoformat()
    payload["best_next_7_days"] = result.best_next_7_days.isoformat()
    payload["validation_mae"] = round(result.validation_mae, 3)
    payload["validation_rmse"] = round(result.validation_rmse, 3)
    output_path = args.output.lower()
    if output_path.endswith(".json"):
        report = json.dumps(payload, indent=2)
    elif output_path.endswith(".txt"):
        report = _text_report(payload)
    else:
        raise ValueError("--output must end with .json or .txt")

    with open(args.output, "w", encoding="utf-8") as output_file:
        output_file.write(report)
    print(f"Saved forecast report to {args.output}")


if __name__ == "__main__":
    main()