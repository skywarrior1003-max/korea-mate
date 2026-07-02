// GoKoreaMate — City Preset Data
// TASK-060-A: Extracted from src/app/page.tsx for multi-city scalability.
// TASK-060-B: Added transport point type so logic can branch on type === "airport"
//             instead of fragile string matching (label.includes("gimhae") etc.).
// Each option has a stable value string (used as state key), a display label,
// lat/lng coordinates passed to the scheduler via URL params, and a semantic type.

export type CityTransportPointType =
  | "airport"
  | "train_station"
  | "bus_terminal"
  | "port"
  | "downtown"
  | "tourist_area"
  | "near_me";

export interface CityPresetOption {
  value: string;
  label: string;
  lat:   number;
  lng:   number;
  type:  CityTransportPointType;
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
    { value: "KTX Busan Station (부산역)",                          label: "🚄 KTX Busan Station",          lat: 35.1148, lng: 129.0420, type: "train_station" },
    { value: "Gimhae International Airport (김해공항)",              label: "✈️ Gimhae Airport",              lat: 35.1794, lng: 128.9383, type: "airport"        },
    { value: "Haeundae (해운대)",                                    label: "🏖️ Haeundae",                   lat: 35.1589, lng: 129.1600, type: "tourist_area"   },
    { value: "Nampo-dong / Gwangbok-ro (남포동)",                    label: "🏙️ Nampo-dong",                 lat: 35.0975, lng: 129.0306, type: "downtown"       },
    { value: "Seomyeon (서면)",                                      label: "🛍️ Seomyeon",                   lat: 35.1575, lng: 129.0592, type: "downtown"       },
    { value: "Gwangalli Beach (광안리해수욕장)",                      label: "🌊 Gwangalli Beach",             lat: 35.1530, lng: 129.1185, type: "tourist_area"   },
    { value: "Busan International Passenger Terminal (부산국제여객터미널)", label: "⛴️ Busan Port Terminal",   lat: 35.1013, lng: 129.0378, type: "port"          },
    { value: "Busan Bus Terminal (부산종합버스터미널)",                label: "🚌 Busan Bus Terminal",         lat: 35.2430, lng: 129.0820, type: "bus_terminal"  },
    { value: "Sasang Bus Terminal (사상버스터미널)",                   label: "🚌 Sasang Bus Terminal",        lat: 35.1476, lng: 128.9937, type: "bus_terminal"  },
  ],
  Seoul: [
    { value: "Incheon International Airport (인천공항)",   label: "✈️ Incheon Airport",          lat: 37.4602, lng: 126.4407, type: "airport"        },
    { value: "Seoul Station (서울역)",                     label: "🚄 Seoul Station",             lat: 37.5547, lng: 126.9706, type: "train_station"  },
    { value: "Hongdae (홍대)",                             label: "🎵 Hongdae",                   lat: 37.5576, lng: 126.9265, type: "downtown"       },
    { value: "Myeongdong (명동)",                          label: "🛍️ Myeongdong",               lat: 37.5636, lng: 126.9816, type: "downtown"       },
    { value: "Gangnam (강남)",                             label: "🏙️ Gangnam",                  lat: 37.4980, lng: 127.0276, type: "downtown"       },
    { value: "Dongdaemun (동대문)",                        label: "🏯 Dongdaemun",               lat: 37.5666, lng: 127.0094, type: "tourist_area"   },
    { value: "Seoul Express Bus Terminal (서울고속버스터미널)", label: "🚌 Seoul Express Terminal", lat: 37.5044, lng: 127.0044, type: "bus_terminal"  },
    { value: "Dong Seoul Bus Terminal (동서울버스터미널)",  label: "🚌 Dong Seoul Bus Terminal",   lat: 37.5369, lng: 127.0938, type: "bus_terminal"  },
  ],
  Jeju: [
    { value: "Jeju International Airport (제주공항)",      label: "✈️ Jeju Airport",            lat: 33.5113, lng: 126.4927, type: "airport"        },
    { value: "Jeju City Center (제주시내)",                label: "🏙️ Jeju City",              lat: 33.4996, lng: 126.5312, type: "downtown"       },
    { value: "Seogwipo (서귀포)",                          label: "🌊 Seogwipo",               lat: 33.2541, lng: 126.5600, type: "downtown"       },
    { value: "Hamdeok Beach (함덕해변)",                   label: "🏖️ Hamdeok Beach",          lat: 33.5435, lng: 126.6684, type: "tourist_area"   },
    { value: "Jeju Coastal Ferry Terminal (제주연안여객터미널)", label: "⛴️ Jeju Ferry Terminal", lat: 33.5267, lng: 126.5254, type: "port"          },
  ],
  Gyeongju: [
    { value: "Gyeongju KTX Station (신경주역)",            label: "🚄 Gyeongju KTX",      lat: 35.8344, lng: 129.2300, type: "train_station"  },
    { value: "Gyeongju City Center (경주시내)",            label: "🏛️ Gyeongju City",     lat: 35.8562, lng: 129.2247, type: "downtown"       },
    { value: "Bulguksa Temple Area (불국사)",              label: "🏯 Bulguksa",          lat: 35.7893, lng: 129.3317, type: "tourist_area"   },
    { value: "Gyeongju Train Station (경주역)",            label: "🚉 Gyeongju Station",  lat: 35.8450, lng: 129.2213, type: "train_station"  },
  ],
};
