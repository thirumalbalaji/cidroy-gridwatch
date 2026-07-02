export interface GeocodeResult {
  lat: number;
  lng: number;
  source: "fixture";
}

const fixtures: Record<string, GeocodeResult> = {
  "Sector 18 Metro Station, Gate 3, Noida, UP 201301": {
    lat: 28.5708,
    lng: 77.3261,
    source: "fixture"
  },
  "Phoenix Marketcity, Whitefield Rd, Mahadevapura, Bengaluru, KA 560048": {
    lat: 12.9966,
    lng: 77.696,
    source: "fixture"
  },
  "Ladestation Hauptbahnhof, Arnulf-Klett-Platz 2, 70173 Stuttgart": {
    lat: 48.7835,
    lng: 9.1816,
    source: "fixture"
  }
};

export function geocodeFromFixture(address: string): GeocodeResult | null {
  return fixtures[address] ?? null;
}
