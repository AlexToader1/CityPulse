export type CitySignal = {
  id: string;
  name: string;
  county: string;
  latitude: number;
  longitude: number;
  score: number;
  signals: {
    events: Array<Record<string, unknown>>;
    holidays: Array<Record<string, unknown>>;
    namedays: Array<Record<string, unknown>>;
    rain_probability_percent: number;
  };
  data_status: string;
};

export type HeatmapResponse = {
  generated_at: string;
  days: number;
  cities: CitySignal[];
};

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `CityPulse API error (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function getHeatmap(days = 7): Promise<HeatmapResponse> {
  return request<HeatmapResponse>(`/heatmap?days=${days}`);
}

export function getCity(cityId: string, days = 7): Promise<CitySignal> {
  return request<CitySignal>(`/city/${encodeURIComponent(cityId)}?days=${days}`);
}

export function generateInsight(question: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/generate", {
    method: "POST",
    body: JSON.stringify({ question }),
  });
}