import { useEffect, useMemo, useState } from "react";
import {
  generateInsight,
  getCity,
  getHeatmap,
  type CitySignal,
} from "./api/client";

function scoreClass(score: number): string {
  if (score >= 70) return "hot";
  if (score >= 50) return "warm";
  return "cool";
}

function App() {
  const [cities, setCities] = useState<CitySignal[]>([]);
  const [selectedId, setSelectedId] = useState("cluj-napoca");
  const [selectedCity, setSelectedCity] = useState<CitySignal | null>(null);
  const [insight, setInsight] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [insightLoading, setInsightLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHeatmap()
      .then((response) => {
        setCities(response.cities);
        const initial = response.cities.find((city) => city.id === selectedId) ?? response.cities[0];
        if (initial) setSelectedId(initial.id);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "API indisponibil"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    getCity(selectedId)
      .then(setSelectedCity)
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Oraș indisponibil"));
  }, [selectedId]);

  const selected = selectedCity ?? cities.find((city) => city.id === selectedId) ?? null;
  const sortedCities = useMemo(() => [...cities].sort((a, b) => b.score - a.score), [cities]);

  async function handleGenerate() {
    if (!selected) return;
    setInsightLoading(true);
    setError(null);
    try {
      setInsight(await generateInsight(
        `Analizează oportunitatea unei reclame pentru ${selected.name}. Folosește vremea, evenimentele, sărbătorile și trendurile disponibile.`,
      ));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Agentul AI nu a răspuns");
    } finally {
      setInsightLoading(false);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CITYPULSE / SIGNAL STUDIO</p>
          <h1>One national ad.<br /><span>Eight local moments.</span></h1>
        </div>
        <div className="status"><i /> Live signals · Open-Meteo + local data</div>
      </header>

      {error && <div className="error">{error}</div>}
      <section className="workspace">
        <div className="map-card">
          <div className="card-heading">
            <div><p className="eyebrow">ROMANIA / NOW</p><h2>CityPulse Index</h2></div>
            <span className="muted">{cities.length} cities</span>
          </div>
          <div className="map">
            {cities.map((city) => (
              <button
                className={`city-dot ${scoreClass(city.score)} ${city.id === selectedId ? "selected" : ""}`}
                key={city.id}
                style={{ left: `${((city.longitude - 20) / 5.5) * 100}%`, top: `${((48 - city.latitude) / 5.2) * 100}%` }}
                onClick={() => setSelectedId(city.id)}
                title={`${city.name}: ${city.score}`}
              >
                <span>{Math.round(city.score)}</span>
                <b>{city.name}</b>
              </button>
            ))}
            {loading && <div className="map-message">Loading live signals…</div>}
            {!loading && cities.length === 0 && <div className="map-message">No city signals available.</div>}
          </div>
          <div className="legend"><span><i className="hot-dot" /> High opportunity</span><span><i className="warm-dot" /> Worth testing</span><span><i className="cool-dot" /> Keep master</span></div>
        </div>

        <aside className="side-panel">
          {selected ? (
            <>
              <div className="city-title"><div><p className="eyebrow">SELECTED CITY</p><h2>{selected.name}</h2><p>{selected.county}</p></div><strong className={scoreClass(selected.score)}>{Math.round(selected.score)}<small>/100</small></strong></div>
              <div className="decision"><span className={scoreClass(selected.score)} /> {selected.score >= 70 ? "Generate a tailored version" : selected.score >= 50 ? "Light-touch adaptation" : "Keep the master ad"}</div>
              <div className="signals">
                <Signal label="Rain probability" value={`${selected.signals.rain_probability_percent}%`} />
                <Signal label="Local events" value={`${selected.signals.events.length}`} />
                <Signal label="Holidays" value={`${selected.signals.holidays.length}`} />
                <Signal label="Namedays" value={`${selected.signals.namedays.length}`} />
              </div>
              <div className="feed">
                <h3>Why now</h3>
                {selected.signals.events.slice(0, 3).map((event, index) => <p key={index}><b>EVENT</b> {String(event["name"] ?? "Local event")}</p>)}
                {selected.signals.holidays.slice(0, 2).map((holiday, index) => <p key={`h-${index}`}><b>DATE</b> {String(holiday["name"] ?? "Holiday")}</p>)}
                {selected.signals.events.length === 0 && selected.signals.holidays.length === 0 && <p className="muted">No strong local moment detected.</p>}
              </div>
              <button className="primary" onClick={handleGenerate} disabled={insightLoading}>{insightLoading ? "Generating…" : "Generate local insight →"}</button>
            </>
          ) : <p className="muted">Select a city to inspect its signals.</p>}
        </aside>
      </section>

      <section className="bottom-grid">
        <div className="table-card"><div className="card-heading"><div><p className="eyebrow">RANKED OPPORTUNITIES</p><h2>Where to make the next version</h2></div></div>{sortedCities.map((city) => <button className={`rank-row ${city.id === selectedId ? "active" : ""}`} key={city.id} onClick={() => setSelectedId(city.id)}><span className="rank">{sortedCities.indexOf(city) + 1}</span><strong>{city.name}</strong><span className="bar"><i style={{ width: `${city.score}%` }} /></span><b>{Math.round(city.score)}</b></button>)}</div>
        <div className="insight-card"><p className="eyebrow">AI REASONING</p><h2>Decision support</h2>{insight ? <pre>{JSON.stringify(insight, null, 2)}</pre> : <p className="muted">Generate an insight for the selected city. The agent will combine local context with the available forecasts.</p>}</div>
      </section>
    </main>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return <div className="signal"><span>{label}</span><strong>{value}</strong></div>;
}

export default App;
