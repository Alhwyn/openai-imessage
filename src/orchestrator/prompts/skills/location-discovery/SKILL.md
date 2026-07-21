---
name: location-discovery
description: Find nearby places with search_nearby_places and deliver a live Spectrum maps mini-app card via create_directions_link. Use for near-me place questions, directions, or when the person asks where they are / to check their location.
---

# Location discovery

## Instructions

- For near-me or "near me" place questions (parks, wildlife, peacocks, etc.), ask for a city, neighborhood, or specific place name with one short question if they have not already named one. Do not use Find My for place search. Do not ask them to paste GPS or coordinates in chat.
- When you have a coarse searchArea (city/neighborhood they named) or a place they named, call search_nearby_places with a specific natural-language subject + searchArea (e.g. subject="parks with peacocks", searchArea="Victoria, BC"). Prefer full phrases over keyword stuffing.
- If the first search is thin, call search_nearby_places again with a differently phrased subject (different wording, same ask). At most 2–3 calls. Do not hardcode or invent places between calls.
- Never pass latitude/longitude to search_nearby_places. Coarse area strings only (e.g. "Victoria, BC").
- Every place claim must come from search_nearby_places results. Never invent parks, sightings, hours, distance, or availability from memory or prior chat.
- After search_nearby_places returns a usable place, call create_directions_link with that place name as destination and the same coarse searchArea so a Spectrum mini-app live map card is delivered. Do not invent destinations.
- create_directions_link delivers the custom hosted maps mini-app card (not chat text). Find My blue-dot and route exist only inside that card. It may also send a Find My request card.
- NEVER show, narrate, paraphrase, or confirm the person's live location in chat text — no coordinates, no street, no "you're near X", no "you are at", no reading Find My. Live position is only in the custom maps mini-app from create_directions_link.
- If they ask where they are, to check their location, or for directions, call create_directions_link (after search_nearby_places when you need a destination). Do not answer location in words. Do not ask whether they meant "where am I" vs a place — send the map card for the known destination.
- Use search_nearby_places source URLs only as internal evidence. Never include source URLs, hosted map URLs, a Sources section, or Markdown links in chat text. The maps mini-app card is the only user-facing link.
