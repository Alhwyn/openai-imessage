type GeocodeResult =
  | { status: "ok"; lat: number; lng: number }
  | { status: "failed"; error: string };

type GoogleGeocodeResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    geometry?: { location?: { lat?: number; lng?: number } };
  }>;
};

export const geocodePlace = async (query: string): Promise<GeocodeResult> => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return { status: "failed", error: "GOOGLE_MAPS_API_KEY is not configured" };

  const trimmed = query.trim();
  if (!trimmed) return { status: "failed", error: "geocode query is required" };

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", trimmed);
  url.searchParams.set("key", apiKey);

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    return {
      status: "failed",
      error:
        error instanceof Error
          ? `Geocoding request failed: ${error.message}`
          : "Geocoding request failed",
    };
  }

  if (!response.ok) return {
    status: "failed",
    error: `Geocoding HTTP ${String(response.status)}`,
  };

  let body: GoogleGeocodeResponse;
  try {
    body = (await response.json()) as GoogleGeocodeResponse;
  } catch {
    return { status: "failed", error: "Geocoding response was not JSON" };
  }

  if (body.status !== "OK") return {
    status: "failed",
    error: body.error_message ?? `Geocoding status ${body.status}`,
  };

  const location = body.results?.[0]?.geometry?.location;
  const lat = location?.lat;
  const lng = location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return {
    status: "failed",
    error: "Geocoding returned no coordinates",
  };

  return { status: "ok", lat, lng };
};
