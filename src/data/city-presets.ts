// GoKoreaMate — City Preset Data
// TASK-060-A: Extracted from src/app/page.tsx for multi-city scalability.
// Each option has a stable value string (used as state key), a display label,
// and lat/lng coordinates passed to the scheduler via URL params.
// NOTE: type field (airport | train_station | bus_terminal | port | …) will be
// added in TASK-060-B. Terminal/port options will be added in TASK-060-C.

export interface CityPresetOption {
  value: string;
  label: string;
  lat:   number;
  lng:   number;
}

// Default arrival option value per city (shown when city tab changes).
export const CITY_ARRIVAL_DEFAULTS: Record<string, string> = {
  Busan:    "KTX Busan Station (부산역)",
  Seoul:    "Incheon International Airport (인천공항)",
  Jeju:     "Jeju International Airport (제주공항)",
  Gyeongju: "Gyeongju KTX Station (신경주역)",
};

// Arrival / departure location options per city.
// value must stay stable — it is persisted in URL params and localStorage.
export const CITY_ARRIVAL_OPTIONS: Record<string, CityPresetOption[]> = {
  Busan: [
    { value: "KTX Busan Station (부산역)",                label: "🚄 KTX Busan Station", lat: 35.1148, lng: 129.0420 },
    { value: "Gimhae International Airport (김해공항)",    label: "✈️ Gimhae Airport",    lat: 35.1794, lng: 128.9383 },
    { value: "Haeundae (해운대)",                          label: "🏖️ Haeundae",          lat: 35.1589, lng: 129.1600 },
    { value: "Nampo-dong / Gwangbok-ro (남포동)",          label: "🏙️ Nampo-dong",        lat: 35.0975, lng: 129.0306 },
    { value: "Seomyeon (서면)",                            label: "🛍️ Seomyeon",          lat: 35.1575, lng: 129.0592 },
    { value: "Gwangalli Beach (광안리해수욕장)",            label: "🌊 Gwangalli Beach",   lat: 35.1530, lng: 129.1185 },
  ],
  Seoul: [
    { value: "Incheon International Airport (인천공항)",   label: "✈️ Incheon Airport",   lat: 37.4602, lng: 126.4407 },
    { value: "Seoul Station (서울역)",                     label: "🚄 Seoul Station",      lat: 37.5547, lng: 126.9706 },
    { value: "Hongdae (홍대)",                             label: "🎵 Hongdae",            lat: 37.5576, lng: 126.9265 },
    { value: "Myeongdong (명동)",                          label: "🛍️ Myeongdong",        lat: 37.5636, lng: 126.9816 },
    { value: "Gangnam (강남)",                             label: "🏙️ Gangnam",           lat: 37.4980, lng: 127.0276 },
    { value: "Dongdaemun (동대문)",                        label: "🏯 Dongdaemun",        lat: 37.5666, lng: 127.0094 },
  ],
  Jeju: [
    { value: "Jeju International Airport (제주공항)",      label: "✈️ Jeju Airport",       lat: 33.5113, lng: 126.4927 },
    { value: "Jeju City Center (제주시내)",                label: "🏙️ Jeju City",         lat: 33.4996, lng: 126.5312 },
    { value: "Seogwipo (서귀포)",                          label: "🌊 Seogwipo",          lat: 33.2541, lng: 126.5600 },
    { value: "Hamdeok Beach (함덕해변)",                   label: "🏖️ Hamdeok Beach",     lat: 33.5435, lng: 126.6684 },
  ],
  Gyeongju: [
    { value: "Gyeongju KTX Station (신경주역)",            label: "🚄 Gyeongju KTX",      lat: 35.8344, lng: 129.2300 },
    { value: "Gyeongju City Center (경주시내)",            label: "🏛️ Gyeongju City",     lat: 35.8562, lng: 129.2247 },
    { value: "Bulguksa Temple Area (불국사)",              label: "🏯 Bulguksa",          lat: 35.7893, lng: 129.3317 },
    { value: "Gyeongju Train Station (경주역)",            label: "🚉 Gyeongju Station",  lat: 35.8450, lng: 129.2213 },
  ],
};
