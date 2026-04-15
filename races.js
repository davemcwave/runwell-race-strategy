/**
 * Race manifest - metadata for all available GPX courses
 * Dates are computed dynamically based on each race's annual schedule.
 */

/**
 * Compute the Nth occurrence of a given weekday in a month/year.
 * week: 1–5 or "last"
 * day: 0=Sun, 1=Mon, ..., 6=Sat
 */
function _nthWeekday(year, month, week, day) {
  if (week === "last") {
    // Start from last day of month, walk back to target weekday
    const last = new Date(year, month, 0); // last day of month
    const diff = (last.getDay() - day + 7) % 7;
    last.setDate(last.getDate() - diff);
    return last;
  }
  // First occurrence of `day` in the month
  const first = new Date(year, month - 1, 1);
  const firstDayOfWeek = first.getDay();
  const offset = (day - firstDayOfWeek + 7) % 7;
  const date = 1 + offset + (week - 1) * 7;
  return new Date(year, month - 1, date);
}

/**
 * Return the next future date for a race schedule, given today.
 * schedule: { month, week, day }
 */
function getNextRaceDate(schedule) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisYear = today.getFullYear();

  // Check this year first, then next year
  for (let y = thisYear; y <= thisYear + 1; y++) {
    const d = _nthWeekday(y, schedule.month, schedule.week, schedule.day);
    if (d > today) return d;
  }
  // Fallback (shouldn't happen)
  return _nthWeekday(thisYear + 1, schedule.month, schedule.week, schedule.day);
}

/**
 * Format a Date as "Month Day, Year"
 */
function formatRaceDate(d) {
  const months = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

const RACES = [
  // ─── World Marathon Majors ──────────────────────────────────
  {
    id: "boston",
    name: "Boston Marathon",
    location: "Boston, MA, USA",
    distance: "42.195 km",
    schedule: { month: 4, week: 3, day: 1 }, // 3rd Monday of April
    file: "gpx/boston-gpx_20250421_id10253_race1_20250406001335.gpx",
    tags: ["world major", "marathon", "usa"],
    emoji: "🦄",
    continent: "north-america",
    lat: 42.3601,
    lng: -71.0589,
  },
  {
    id: "berlin",
    name: "BMW Berlin Marathon",
    location: "Berlin, Germany",
    distance: "42.195 km",
    schedule: { month: 9, week: "last", day: 0 }, // last Sunday of September
    file: "gpx/berlin-gpx_20250921_id10469_race1_20250820171513.gpx",
    tags: ["world major", "marathon", "germany"],
    emoji: "🇩🇪",
    continent: "europe",
    lat: 52.5200,
    lng: 13.4050,
  },
  {
    id: "chicago",
    name: "Bank of America Chicago Marathon",
    location: "Chicago, IL, USA",
    distance: "42.195 km",
    schedule: { month: 10, week: 2, day: 0 }, // 2nd Sunday of October
    file: "gpx/chicago-gpx_20251012_id10457_race1_20250826213208.gpx",
    tags: ["world major", "marathon", "usa"],
    emoji: "🌬️",
    continent: "north-america",
    lat: 41.8781,
    lng: -87.6298,
  },
  {
    id: "nyc",
    name: "TCS New York City Marathon",
    location: "New York, NY, USA",
    distance: "42.195 km",
    schedule: { month: 11, week: 1, day: 0 }, // 1st Sunday of November
    file: "gpx/nyc-gpx_20251102_id10470_race1_20250929105512.gpx",
    tags: ["world major", "marathon", "usa"],
    emoji: "🗽",
    continent: "north-america",
    lat: 40.7128,
    lng: -74.0060,
  },
  {
    id: "london",
    name: "TCS London Marathon",
    location: "London, England",
    distance: "42.195 km",
    schedule: { month: 4, week: "last", day: 0 }, // last Sunday of April
    file: "gpx/london-gpx_20250427_id10099_race1_20241212094041.gpx",
    tags: ["world major", "marathon", "uk"],
    emoji: "🇬🇧",
    continent: "europe",
    lat: 51.5074,
    lng: -0.1278,
  },
  {
    id: "tokyo",
    name: "Tokyo Marathon",
    location: "Tokyo, Japan",
    distance: "42.195 km",
    schedule: { month: 3, week: 1, day: 0 }, // 1st Sunday of March
    file: "gpx/tokyo-gpx_20250302_id10141_race1_20250121235910.gpx",
    tags: ["world major", "marathon", "japan"],
    emoji: "🗼",
    continent: "asia",
    lat: 35.6762,
    lng: 139.6503,
  },

  // ─── North America ──────────────────────────────────────────
  {
    id: "cim",
    name: "California International Marathon",
    location: "Sacramento, CA, USA",
    distance: "42.195 km",
    schedule: { month: 12, week: 1, day: 0 }, // 1st Sunday of December
    file: "gpx/cim-gpx_20241208_id10069_race1_20241113130152.gpx",
    tags: ["marathon", "usa", "fast", "bq"],
    emoji: "☀️",
    continent: "north-america",
    lat: 38.5816,
    lng: -121.4944,
  },
  {
    id: "richmond",
    name: "Allianz Richmond Marathon",
    location: "Richmond, VA, USA",
    distance: "42.195 km",
    schedule: { month: 11, week: 2, day: 6 }, // 2nd Saturday of November
    file: "gpx/richmond-gpx_20251115_id10613_race1_20251109172515.gpx",
    tags: ["marathon", "usa"],
    emoji: "🏛️",
    continent: "north-america",
    lat: 37.5407,
    lng: -77.4360,
  },
  {
    id: "dallas",
    name: "BMW Dallas Marathon",
    location: "Dallas, TX, USA",
    distance: "42.195 km",
    schedule: { month: 12, week: 2, day: 0 }, // 2nd Sunday of December
    file: "gpx/dallas-gpx_20241215_id10070_race2_20241113151643.gpx",
    tags: ["marathon", "usa"],
    emoji: "⛳",
    continent: "north-america",
    lat: 32.7767,
    lng: -96.7970,
  },
  {
    id: "honolulu",
    name: "Honolulu Marathon",
    location: "Honolulu, HI, USA",
    distance: "42.195 km",
    schedule: { month: 12, week: 2, day: 0 }, // 2nd Sunday of December
    file: "gpx/honolulu-gpx_20251214_id10639_race1_20251128120508.gpx",
    tags: ["marathon", "usa"],
    emoji: "🌺",
    continent: "north-america",
    lat: 21.3069,
    lng: -157.8583,
  },
  {
    id: "marinecorps",
    name: "Marine Corps Marathon",
    location: "Arlington, VA, USA",
    distance: "42.195 km",
    schedule: { month: 10, week: "last", day: 0 }, // last Sunday of October
    file: "gpx/marinecorps-gpx_20241027_id10044_race2_20241017155603.gpx",
    tags: ["marathon", "usa"],
    emoji: "🎖️",
    continent: "north-america",
    lat: 38.8799,
    lng: -77.0711,
  },
  {
    id: "houston",
    name: "Chevron Houston Marathon",
    location: "Houston, TX, USA",
    distance: "42.195 km",
    schedule: { month: 1, week: 3, day: 0 }, // 3rd Sunday of January
    file: "gpx/houston-gpx_20260111_id10679_race1_20260101225905.gpx",
    tags: ["marathon", "usa"],
    emoji: "🚀",
    continent: "north-america",
    lat: 29.7604,
    lng: -95.3698,
  },
  {
    id: "la",
    name: "Los Angeles Marathon",
    location: "Los Angeles, CA, USA",
    distance: "42.195 km",
    schedule: { month: 3, week: 2, day: 0 }, // 2nd Sunday of March
    file: "gpx/la-gpx_20260308_id10751_race1_20260221125525.gpx",
    tags: ["marathon", "usa"],
    emoji: "🌴",
    continent: "north-america",
    lat: 34.0522,
    lng: -118.2437,
  },
  {
    id: "philly",
    name: "Philadelphia Marathon",
    location: "Philadelphia, PA, USA",
    distance: "42.195 km",
    schedule: { month: 11, week: 4, day: 0 }, // 4th Sunday of November
    file: "gpx/philly-gpx_20251123_id10629_race1_20251113113852.gpx",
    tags: ["marathon", "usa"],
    emoji: "🔔",
    continent: "north-america",
    lat: 39.9526,
    lng: -75.1652,
  },
  {
    id: "detroit",
    name: "Detroit Free Press Marathon",
    location: "Detroit, MI, USA",
    distance: "42.195 km",
    schedule: { month: 10, week: 3, day: 0 }, // 3rd Sunday of October
    file: "gpx/detroit-gpx_20251019_id10591_race1_20251008111221.gpx",
    tags: ["marathon", "usa"],
    emoji: "🚗",
    continent: "north-america",
    lat: 42.3314,
    lng: -83.0458,
  },
  {
    id: "twincities",
    name: "Medtronic Twin Cities Marathon",
    location: "Minneapolis, MN, USA",
    distance: "42.195 km",
    schedule: { month: 10, week: 1, day: 0 }, // 1st Sunday of October
    file: "gpx/twincities-gpx_20230930_id8198_race1_20230903170604.gpx",
    tags: ["marathon", "usa"],
    emoji: "🌲",
    continent: "north-america",
    lat: 44.9778,
    lng: -93.2650,
  },
  {
    id: "stgeorge",
    name: "St. George Marathon",
    location: "St. George, UT, USA",
    distance: "42.195 km",
    schedule: { month: 10, week: 1, day: 6 }, // 1st Saturday of October
    file: "gpx/stgeorge-gpx_20251004_id10578_race1_20250923173508.gpx",
    tags: ["marathon", "usa", "fast", "bq"],
    emoji: "🏜️",
    continent: "north-america",
    lat: 37.1041,
    lng: -113.5762,
  },
  {
    id: "grandmas",
    name: "Grandma's Marathon",
    location: "Duluth, MN, USA",
    distance: "42.195 km",
    schedule: { month: 6, week: 3, day: 6 }, // 3rd Saturday of June
    file: "gpx/grandmas-gpx_20250621_id10335_race1_20250606173247.gpx",
    tags: ["marathon", "usa"],
    emoji: "🌊",
    continent: "north-america",
    lat: 46.7845,
    lng: -92.1055,
  },
  {
    id: "bigsur",
    name: "Big Sur International Marathon",
    location: "Big Sur, CA, USA",
    distance: "42.195 km",
    schedule: { month: 4, week: "last", day: 0 }, // last Sunday of April
    file: "gpx/bigsur-gpx_20240428_id8679_race1_20250117093547.gpx",
    tags: ["marathon", "usa"],
    emoji: "🌁",
    continent: "north-america",
    lat: 36.2704,
    lng: -121.8081,
  },
  {
    id: "seattle",
    name: "Seattle Marathon",
    location: "Seattle, WA, USA",
    distance: "42.195 km",
    schedule: { month: 11, week: "last", day: 0 }, // last Sunday of November
    file: "gpx/seattle-gpx_20251130_id10634_race1_20251116225338.gpx",
    tags: ["marathon", "usa"],
    emoji: "☕",
    continent: "north-america",
    lat: 47.6092,
    lng: -122.3339,
  },
  {
    id: "sanfrancisco",
    name: "San Francisco Marathon",
    location: "San Francisco, CA, USA",
    distance: "42.195 km",
    schedule: { month: 7, week: "last", day: 0 }, // last Sunday of July
    file: "gpx/sanfrancisco-gpx_20250727_id10351_race1_20250623184730.gpx",
    tags: ["marathon", "usa"],
    emoji: "🌉",
    continent: "north-america",
    lat: 37.7947,
    lng: -122.3942,
  },
  {
    id: "miami",
    name: "Life Time Miami Marathon",
    location: "Miami, FL, USA",
    distance: "42.195 km",
    schedule: { month: 1, week: "last", day: 0 }, // last Sunday of January
    file: "gpx/miami-gpx_20260125_id10713_race1_20260116221258.gpx",
    tags: ["marathon", "usa"],
    emoji: "🌴",
    continent: "north-america",
    lat: 25.7808,
    lng: -80.1868,
  },
  {
    id: "austin",
    name: "Austin Marathon",
    location: "Austin, TX, USA",
    distance: "42.195 km",
    schedule: { month: 2, week: 3, day: 0 }, // 3rd Sunday of February
    file: "gpx/austin-gpx_20260215_id10707_race1_20260114125519.gpx",
    tags: ["marathon", "usa"],
    emoji: "🤠",
    continent: "north-america",
    lat: 30.2672,
    lng: -97.7431,
  },
  {
    id: "mtcharleston",
    name: "REVEL Mt Charleston Marathon",
    location: "Las Vegas, NV, USA",
    distance: "42.195 km",
    schedule: { month: 3, week: "last", day: 6 }, // last Saturday of March
    file: "gpx/mtcharleston-gpx_20260328_id10799_race1_20260317073402.gpx",
    tags: ["marathon", "usa", "fast", "bq"],
    emoji: "🏔️",
    continent: "north-america",
    lat: 36.1716,
    lng: -115.1391,
  },
  {
    id: "pittsburgh",
    name: "Pittsburgh Marathon",
    location: "Pittsburgh, PA, USA",
    distance: "42.195 km",
    schedule: { month: 5, week: 1, day: 0 }, // 1st Sunday of May
    file: "gpx/pittsburgh-gpx_20250504_id10282_race1_20250425194513.gpx",
    tags: ["marathon", "usa"],
    emoji: "🌉",
    continent: "north-america",
    lat: 40.4387,
    lng: -79.9972,
  },
  {
    id: "jacksonville",
    name: "Jacksonville Marathon",
    location: "Jacksonville, FL, USA",
    distance: "42.195 km",
    schedule: { month: 12, week: 2, day: 0 }, // 2nd Sunday of December
    file: "gpx/jacksonville-gpx_20231210_id8261_race1_20231125181731.gpx",
    tags: ["marathon", "usa"],
    emoji: "🐆",
    continent: "north-america",
    lat: 30.3322,
    lng: -81.6557,
  },
  {
    id: "mesa",
    name: "Mesa Marathon",
    location: "Mesa, AZ, USA",
    distance: "42.195 km",
    schedule: { month: 2, week: 1, day: 6 }, // 1st Saturday of February
    file: "gpx/mesa-gpx_20250208_id10133_race1_20250120175208.gpx",
    tags: ["marathon", "usa", "fast", "bq"],
    emoji: "🌵",
    continent: "north-america",
    lat: 33.4744,
    lng: -111.6273,
  },


  {
    id: "portland",
    name: "Portland Marathon",
    location: "Portland, OR, USA",
    distance: "42.195 km",
    schedule: { month: 10, week: 1, day: 0 }, // 1st Sunday of October
    file: "gpx/portland-marathon.gpx",
    tags: ["marathon", "usa"],
    emoji: "🌹",
    continent: "north-america",
    lat: 45.5162,
    lng: -122.6770,
  },
  {
    id: "shamrock",
    name: "Shamrock Marathon",
    location: "Virginia Beach, VA, USA",
    distance: "42.195 km",
    schedule: { month: 3, week: 3, day: 0 }, // 3rd Sunday of March
    file: "gpx/shamrock-marathon-vabeach.gpx",
    tags: ["marathon", "usa", "fast"],
    emoji: "☘️",
    continent: "north-america",
    lat: 36.8529,
    lng: -75.9780,
  },
  {
    id: "indianapolis",
    name: "CNO Financial Indianapolis Monumental Marathon",
    location: "Indianapolis, IN, USA",
    distance: "42.195 km",
    schedule: { month: 11, week: 1, day: 6 }, // 1st Saturday of November
    file: "gpx/indianapolis-monumental.gpx",
    tags: ["marathon", "usa", "fast", "bq"],
    emoji: "🏁",
    continent: "north-america",
    lat: 39.7684,
    lng: -86.1581,
  },

  // ─── Canada ──────────────────────────────────────────────────
  {
    id: "toronto",
    name: "TCS Toronto Waterfront Marathon",
    location: "Toronto, ON, Canada",
    distance: "42.195 km",
    schedule: { month: 10, week: 3, day: 0 }, // 3rd Sunday of October
    file: "gpx/toronto-marathon.gpx",
    tags: ["marathon", "canada"],
    emoji: "🇨🇦",
    continent: "north-america",
    lat: 43.6610,
    lng: -79.3829,
  },
  {
    id: "ottawa",
    name: "Tamarack Ottawa Marathon",
    location: "Ottawa, ON, Canada",
    distance: "42.195 km",
    schedule: { month: 5, week: "last", day: 0 }, // last Sunday of May
    file: "gpx/ottawa-marathon.gpx",
    tags: ["marathon", "canada"],
    emoji: "🍁",
    continent: "north-america",
    lat: 45.4213,
    lng: -75.6924,
  },
  {
    id: "vancouver",
    name: "BMO Vancouver Marathon",
    location: "Vancouver, BC, Canada",
    distance: "42.195 km",
    schedule: { month: 5, week: 1, day: 0 }, // 1st Sunday of May
    file: "gpx/vancouver-marathon.gpx",
    tags: ["marathon", "canada"],
    emoji: "🏔️",
    continent: "north-america",
    lat: 49.2430,
    lng: -123.1091,
  },
  {
    id: "calgary",
    name: "Servus Calgary Marathon",
    location: "Calgary, AB, Canada",
    distance: "42.195 km",
    schedule: { month: 5, week: "last", day: 0 }, // last Sunday of May
    file: "gpx/calgary-marathon.gpx",
    tags: ["marathon", "canada"],
    emoji: "🤠",
    continent: "north-america",
    lat: 51.0363,
    lng: -114.0550,
  },
  {
    id: "vancouver-half",
    name: "Vancouver Half Marathon",
    location: "Vancouver, BC, Canada",
    distance: "21.1 km",
    schedule: { month: 6, week: 4, day: 0 }, // 4th Sunday of June
    file: "gpx/vancouver-half.gpx",
    tags: ["half marathon", "canada"],
    emoji: "🏔️",
    continent: "north-america",
    lat: 49.2587,
    lng: -123.2545,
  },
  {
    id: "calgary-half",
    name: "Calgary Half Marathon",
    location: "Calgary, AB, Canada",
    distance: "21.1 km",
    schedule: { month: 9, week: 3, day: 0 }, // 3rd Sunday of September
    file: "gpx/calgary-half.gpx",
    tags: ["half marathon", "canada"],
    emoji: "🤠",
    continent: "north-america",
    lat: 51.0350,
    lng: -114.0568,
  },

  // ─── Europe ─────────────────────────────────────────────────
  {
    id: "paris",
    name: "Marathon de Paris",
    location: "Paris, France",
    distance: "42.195 km",
    schedule: { month: 4, week: 2, day: 0 }, // 2nd Sunday of April
    file: "gpx/paris-gpx_20260412_id10915_race1_20260322120025.gpx",
    tags: ["marathon", "france"],
    emoji: "🗼",
    continent: "europe",
    lat: 48.8566,
    lng: 2.3522,
  },
  {
    id: "amsterdam",
    name: "TCS Amsterdam Marathon",
    location: "Amsterdam, Netherlands",
    distance: "42.195 km",
    schedule: { month: 10, week: 3, day: 0 }, // 3rd Sunday of October
    file: "gpx/amsterdam-gpx_20251019_id10593_race1_20251008174616.gpx",
    tags: ["marathon", "netherlands"],
    emoji: "🇳🇱",
    continent: "europe",
    lat: 52.3676,
    lng: 4.9041,
  },
  {
    id: "barcelona",
    name: "Barcelona Marathon",
    location: "Barcelona, Spain",
    distance: "42.195 km",
    schedule: { month: 3, week: 2, day: 0 }, // 2nd Sunday of March
    file: "gpx/barcelona-gpx_20260315_id10746_race1_20260215184303.gpx",
    tags: ["marathon", "spain"],
    emoji: "🇪🇸",
    continent: "europe",
    lat: 41.3874,
    lng: 2.1686,
  },
  {
    id: "copenhagen",
    name: "Copenhagen Marathon",
    location: "Copenhagen, Denmark",
    distance: "42.195 km",
    schedule: { month: 5, week: 3, day: 0 }, // 3rd Sunday of May
    file: "gpx/copenhagen-gpx_20240505_id9645_race1_20240325215115.gpx",
    tags: ["marathon", "denmark"],
    emoji: "🇩🇰",
    continent: "europe",
    lat: 55.6761,
    lng: 12.5683,
  },
  {
    id: "dublin",
    name: "Irish Life Dublin Marathon",
    location: "Dublin, Ireland",
    distance: "42.195 km",
    schedule: { month: 10, week: "last", day: 0 }, // last Sunday of October
    file: "gpx/dublin-gpx_20251026_id10597_race1_20251009155423.gpx",
    tags: ["marathon", "ireland"],
    emoji: "🍀",
    continent: "europe",
    lat: 53.3498,
    lng: -6.2603,
  },
  {
    id: "istanbul",
    name: "Istanbul Marathon",
    location: "Istanbul, Turkey",
    distance: "42.195 km",
    schedule: { month: 11, week: 1, day: 0 }, // 1st Sunday of November
    file: "gpx/istanbul-gpx_20251102_id10600_race1_20251021220217.gpx",
    tags: ["marathon", "turkey"],
    emoji: "🇹🇷",
    continent: "europe",
    lat: 41.0082,
    lng: 28.9784,
  },
  {
    id: "prague",
    name: "ORLEN Prague Marathon",
    location: "Prague, Czech Republic",
    distance: "42.195 km",
    schedule: { month: 5, week: 1, day: 0 }, // 1st Sunday of May
    file: "gpx/prague-gpx_20250504_id10286_race1_20250427161946.gpx",
    tags: ["marathon", "czech republic"],
    emoji: "🇨🇿",
    continent: "europe",
    lat: 50.0755,
    lng: 14.4378,
  },
  {
    id: "seville",
    name: "Zurich Maraton de Sevilla",
    location: "Seville, Spain",
    distance: "42.195 km",
    schedule: { month: 2, week: 3, day: 0 }, // 3rd Sunday of February
    file: "gpx/seville-gpx_20250223_id10137_race1_20250121223305.gpx",
    tags: ["marathon", "spain"],
    emoji: "🌞",
    continent: "europe",
    lat: 37.3891,
    lng: -5.9845,
  },
  {
    id: "stockholm",
    name: "adidas Stockholm Marathon",
    location: "Stockholm, Sweden",
    distance: "42.195 km",
    schedule: { month: 5, week: "last", day: 6 }, // last Saturday of May
    file: "gpx/stockholm-gpx_20250531_id10314_race1_20250522122742.gpx",
    tags: ["marathon", "sweden"],
    emoji: "🇸🇪",
    continent: "europe",
    lat: 59.3293,
    lng: 18.0686,
  },
  {
    id: "vienna",
    name: "Vienna City Marathon",
    location: "Vienna, Austria",
    distance: "42.195 km",
    schedule: { month: 4, week: 3, day: 0 }, // 3rd Sunday of April
    file: "gpx/vienna-gpx_20250406_id10237_race1_20250326155225.gpx",
    tags: ["marathon", "austria"],
    emoji: "🇦🇹",
    continent: "europe",
    lat: 48.2082,
    lng: 16.3738,
  },
  {
    id: "athens",
    name: "Athens Marathon",
    location: "Athens, Greece",
    distance: "42.195 km",
    schedule: { month: 11, week: 2, day: 0 }, // 2nd Sunday of November
    file: "gpx/athens-gpx_20251109_id10295_race1_20250929172209.gpx",
    tags: ["marathon", "greece"],
    emoji: "🏛️",
    continent: "europe",
    lat: 37.9838,
    lng: 23.7275,
  },

  // ─── Asia & Middle East ─────────────────────────────────────
  {
    id: "dubai",
    name: "Dubai Marathon",
    location: "Dubai, UAE",
    distance: "42.195 km",
    schedule: { month: 1, week: 2, day: 5 }, // 2nd Friday of January
    file: "gpx/dubai-gpx_20250112_id10084_race1_20241205213604.gpx",
    tags: ["marathon", "uae"],
    emoji: "🏜️",
    continent: "asia",
    lat: 25.2048,
    lng: 55.2708,
  },
  {
    id: "mumbai",
    name: "TATA Mumbai Marathon",
    location: "Mumbai, India",
    distance: "42.195 km",
    schedule: { month: 1, week: 3, day: 0 }, // 3rd Sunday of January
    file: "gpx/mumbai-gpx_20250119_id10095_race1_20250108125849.gpx",
    tags: ["marathon", "india"],
    emoji: "🇮🇳",
    continent: "asia",
    lat: 19.0760,
    lng: 72.8777,
  },
  {
    id: "osaka",
    name: "Osaka Marathon",
    location: "Osaka, Japan",
    distance: "42.195 km",
    schedule: { month: 2, week: "last", day: 0 }, // last Sunday of February
    file: "gpx/osaka-gpx_20250224_id10134_race1_20250121145438.gpx",
    tags: ["marathon", "japan"],
    emoji: "🏯",
    continent: "asia",
    lat: 34.6937,
    lng: 135.5023,
  },
  {
    id: "seoul",
    name: "Seoul Marathon",
    location: "Seoul, South Korea",
    distance: "42.195 km",
    schedule: { month: 3, week: 3, day: 0 }, // 3rd Sunday of March
    file: "gpx/seoul-gpx_20250316_id10215_race1_20250306003118.gpx",
    tags: ["marathon", "south korea"],
    emoji: "🇰🇷",
    continent: "asia",
    lat: 37.5665,
    lng: 126.9780,
  },
  {
    id: "singapore",
    name: "Singapore Marathon",
    location: "Singapore",
    distance: "42.195 km",
    schedule: { month: 12, week: 1, day: 0 }, // 1st Sunday of December
    file: "gpx/singapore-gpx_20241201_id10067_race1_20241111170942.gpx",
    tags: ["marathon", "singapore"],
    emoji: "🇸🇬",
    continent: "asia",
    lat: 1.3521,
    lng: 103.8198,
  },

  // ─── Africa & Oceania ───────────────────────────────────────
  {
    id: "capetown",
    name: "Sanlam Cape Town Marathon",
    location: "Cape Town, South Africa",
    distance: "42.195 km",
    schedule: { month: 10, week: 3, day: 0 }, // 3rd Sunday of October
    file: "gpx/capetown-gpx_20251019_id10590_race1_20251007172424.gpx",
    tags: ["marathon", "south africa"],
    emoji: "🇿🇦",
    continent: "africa",
    lat: -33.9249,
    lng: 18.4241,
  },
  {
    id: "sydney",
    name: "TCS Sydney Marathon",
    location: "Sydney, Australia",
    distance: "42.195 km",
    schedule: { month: 9, week: 3, day: 0 }, // 3rd Sunday of September
    file: "gpx/sydney-gpx_20250831_id10468_race1_20250820101411.gpx",
    tags: ["world major", "marathon", "australia"],
    emoji: "🇦🇺",
    continent: "oceania",
    lat: -33.8688,
    lng: 151.2093,
  },
  {
    id: "goldcoast",
    name: "Gold Coast Marathon",
    location: "Gold Coast, Australia",
    distance: "42.195 km",
    schedule: { month: 7, week: 1, day: 0 }, // 1st Sunday of July
    file: "gpx/goldcoast-gpx_20250706_id10354_race1_20250626111156.gpx",
    tags: ["marathon", "australia"],
    emoji: "🏖️",
    continent: "oceania",
    lat: -28.0167,
    lng: 153.4000,
  },

  {
    id: "eugene",
    name: "Eugene Marathon",
    location: "Eugene, OR, USA",
    distance: "42.195 km",
    schedule: { month: 4, week: "last", day: 0 }, // last Sunday of April
    file: "gpx/eugene-marathon.gpx",
    tags: ["marathon", "usa", "fast", "bq"],
    emoji: "🦆",
    continent: "north-america",
    lat: 44.0521,
    lng: -123.0868,
  },
  {
    id: "flyingpig",
    name: "Flying Pig Marathon",
    location: "Cincinnati, OH, USA",
    distance: "42.195 km",
    schedule: { month: 5, week: 1, day: 0 }, // 1st Sunday of May
    file: "gpx/flyingpig-marathon.gpx",
    tags: ["marathon", "usa"],
    emoji: "🐷",
    continent: "north-america",
    lat: 39.0969,
    lng: -84.5152,
  },
  {
    id: "route66",
    name: "Williams Route 66 Marathon",
    location: "Tulsa, OK, USA",
    distance: "42.195 km",
    schedule: { month: 11, week: 4, day: 0 }, // 4th Sunday of November
    file: "gpx/route66-marathon.gpx",
    tags: ["marathon", "usa"],
    emoji: "🛣️",
    continent: "north-america",
    lat: 36.1497,
    lng: -95.9891,
  },
  {
    id: "sandiego",
    name: "Rock 'n' Roll San Diego Marathon",
    location: "San Diego, CA, USA",
    distance: "42.195 km",
    schedule: { month: 6, week: 1, day: 0 }, // 1st Sunday of June
    file: "gpx/sandiego-marathon.gpx",
    tags: ["marathon", "usa"],
    emoji: "🌊",
    continent: "north-america",
    lat: 32.7366,
    lng: -117.1594,
  },
  {
    id: "colfax",
    name: "Denver Colfax Marathon",
    location: "Denver, CO, USA",
    distance: "42.195 km",
    schedule: { month: 5, week: 3, day: 0 }, // 3rd Sunday of May
    file: "gpx/colfax-marathon.gpx",
    tags: ["marathon", "usa"],
    emoji: "🏔️",
    continent: "north-america",
    lat: 39.7478,
    lng: -104.9483,
  },
  {
    id: "disney",
    name: "Walt Disney World Marathon",
    location: "Orlando, FL, USA",
    distance: "42.195 km",
    schedule: { month: 1, week: 2, day: 0 }, // 2nd Sunday of January
    file: "gpx/disney-marathon.gpx",
    tags: ["marathon", "usa"],
    emoji: "🏰",
    continent: "north-america",
    lat: 28.3809,
    lng: -81.5465,
  },

  // ─── Full Marathons (additional) ────────────────────────
  {
    id: "edinburgh",
    name: "Edinburgh Marathon",
    location: "Edinburgh, Scotland",
    distance: "42.195 km",
    schedule: { month: 5, week: "last", day: 0 }, // last Sunday of May
    file: "gpx/edinburgh-gpx_20250525_id10302_race1.gpx",
    tags: ["marathon", "uk"],
    emoji: "🏴󠁧󠁢󠁳󠁣󠁴󠁿",
    continent: "europe",
    lat: 55.9533,
    lng: -3.1883,
  },

  // ─── Half Marathons ─────────────────────────────────────
  {
    id: "nyc-half",
    name: "United Airlines NYC Half",
    location: "New York, NY, USA",
    distance: "21.1 km",
    schedule: { month: 3, week: 3, day: 0 }, // 3rd Sunday of March
    file: "gpx/nychalf-gpx_20260315_id10809_race1.gpx",
    tags: ["half marathon", "usa"],
    emoji: "🗽",
    continent: "north-america",
    lat: 40.6816,
    lng: -73.9645,
  },
  {
    id: "brooklyn-half",
    name: "RBC Brooklyn Half",
    location: "Brooklyn, NY, USA",
    distance: "21.1 km",
    schedule: { month: 5, week: 3, day: 6 }, // 3rd Saturday of May
    file: "gpx/brooklynhalf-gpx_20250517_id10299_race1.gpx",
    tags: ["half marathon", "usa"],
    emoji: "🌉",
    continent: "north-america",
    lat: 40.6602,
    lng: -73.9690,
  },
  {
    id: "great-north-run",
    name: "Great North Run",
    location: "Newcastle, England",
    distance: "21.1 km",
    schedule: { month: 9, week: 1, day: 0 }, // 1st Sunday of September
    file: "gpx/greatnorthrun-gpx_20250905_id10556_race1.gpx",
    tags: ["half marathon", "uk"],
    emoji: "🇬🇧",
    continent: "europe",
    lat: 54.9783,
    lng: -1.6178,
  },
  {
    id: "berlin-half",
    name: "Generali Berlin Half Marathon",
    location: "Berlin, Germany",
    distance: "21.1 km",
    schedule: { month: 4, week: 1, day: 0 }, // 1st Sunday of April
    file: "gpx/berlinhalf-gpx_20250406_id10243_race1.gpx",
    tags: ["half marathon", "germany"],
    emoji: "🇩🇪",
    continent: "europe",
    lat: 52.5141,
    lng: 13.3493,
  },
  {
    id: "rome-half",
    name: "Wizz Air Rome Half Marathon",
    location: "Rome, Italy",
    distance: "21.1 km",
    schedule: { month: 10, week: 3, day: 0 }, // 3rd Sunday of October
    file: "gpx/romehalf-gpx_20251019_id10594_race1.gpx",
    tags: ["half marathon", "italy"],
    emoji: "🇮🇹",
    continent: "europe",
    lat: 41.8853,
    lng: 12.4852,
  },
  {
    id: "paris-half",
    name: "Semi de Paris",
    location: "Paris, France",
    distance: "21.1 km",
    schedule: { month: 3, week: 2, day: 0 }, // 2nd Sunday of March
    file: "gpx/parishalf-gpx_20250309_id10193_race1.gpx",
    tags: ["half marathon", "france"],
    emoji: "🇫🇷",
    continent: "europe",
    lat: 48.8536,
    lng: 2.3342,
  },
  {
    id: "las-vegas-half",
    name: "Rock 'n' Roll Las Vegas Half",
    location: "Las Vegas, NV, USA",
    distance: "21.1 km",
    schedule: { month: 2, week: "last", day: 0 }, // last Sunday of February
    file: "gpx/lasvegashalf-gpx_20260222_id10744_race1.gpx",
    tags: ["half marathon", "usa"],
    emoji: "🎰",
    continent: "north-america",
    lat: 36.1716,
    lng: -115.1391,
  },
  {
    id: "manchester-half",
    name: "Manchester Half Marathon",
    location: "Manchester, England",
    distance: "21.1 km",
    schedule: { month: 10, week: 2, day: 0 }, // 2nd Sunday of October
    file: "gpx/manchesterhalf-gpx_20251012_id10505_race1.gpx",
    tags: ["half marathon", "uk"],
    emoji: "🇬🇧",
    continent: "europe",
    lat: 53.4808,
    lng: -2.2426,
  },
  {
    id: "chicago-half",
    name: "Life Time Chicago Half Marathon",
    location: "Chicago, IL, USA",
    distance: "21.1 km",
    schedule: { month: 9, week: "last", day: 0 }, // last Sunday of September
    file: "gpx/chicagohalf-gpx_20250928_id10476_race1.gpx",
    tags: ["half marathon", "usa"],
    emoji: "🌬️",
    continent: "north-america",
    lat: 41.7780,
    lng: -87.5793,
  },
  {
    id: "lisbon-half",
    name: "Lisbon Half Marathon",
    location: "Lisbon, Portugal",
    distance: "21.1 km",
    schedule: { month: 10, week: 1, day: 0 }, // 1st Sunday of October
    file: "gpx/lisbonhalf-gpx_20241006_id9799_race2.gpx",
    tags: ["half marathon", "portugal"],
    emoji: "🇵🇹",
    continent: "europe",
    lat: 38.7073,
    lng: -9.1364,
  },
  {
    id: "gothenburg-half",
    name: "Göteborgsvarvet Half Marathon",
    location: "Gothenburg, Sweden",
    distance: "21.1 km",
    schedule: { month: 5, week: 3, day: 6 }, // 3rd Saturday of May
    file: "gpx/gothenburghalf-gpx_20240518_id9834_race1.gpx",
    tags: ["half marathon", "sweden"],
    emoji: "🇸🇪",
    continent: "europe",
    lat: 57.6802,
    lng: 11.9397,
  },
  {
    id: "flyingpig-half",
    name: "Flying Pig Half Marathon",
    location: "Cincinnati, OH, USA",
    distance: "21.1 km",
    schedule: { month: 5, week: 1, day: 0 }, // 1st Sunday of May
    file: "gpx/flyingpig-half.gpx",
    tags: ["half marathon", "usa"],
    emoji: "🐷",
    continent: "north-america",
    lat: 39.0974,
    lng: -84.5154,
  },
  {
    id: "napa-half",
    name: "Napa to Sonoma Half Marathon",
    location: "Napa, CA, USA",
    distance: "21.1 km",
    schedule: { month: 7, week: 3, day: 0 }, // 3rd Sunday of July
    file: "gpx/napahalf.gpx",
    tags: ["half marathon", "usa"],
    emoji: "🍷",
    continent: "north-america",
    lat: 38.2540,
    lng: -122.3487,
  },
  {
    id: "valencia-half",
    name: "Medio Maratón Valencia",
    location: "Valencia, Spain",
    distance: "21.1 km",
    schedule: { month: 10, week: "last", day: 0 }, // last Sunday of October
    file: "gpx/valenciahalf.gpx",
    tags: ["half marathon", "spain", "fast"],
    emoji: "🇪🇸",
    continent: "europe",
    lat: 39.4811,
    lng: -0.3493,
  },
  {
    id: "copenhagen-half",
    name: "Copenhagen Half Marathon",
    location: "Copenhagen, Denmark",
    distance: "21.1 km",
    schedule: { month: 9, week: 3, day: 0 }, // 3rd Sunday of September
    file: "gpx/copenhagenhalf.gpx",
    tags: ["half marathon", "denmark"],
    emoji: "🇩🇰",
    continent: "europe",
    lat: 55.7073,
    lng: 12.5679,
  },
  {
    id: "stockholm-half",
    name: "Stockholm Half Marathon",
    location: "Stockholm, Sweden",
    distance: "21.1 km",
    schedule: { month: 4, week: "last", day: 6 }, // last Saturday of April
    file: "gpx/stockholmhalf.gpx",
    tags: ["half marathon", "sweden"],
    emoji: "🇸🇪",
    continent: "europe",
    lat: 59.3236,
    lng: 18.1201,
  },
  {
    id: "prague-half",
    name: "Prague Half Marathon",
    location: "Prague, Czech Republic",
    distance: "21.1 km",
    schedule: { month: 4, week: 1, day: 6 }, // 1st Saturday of April
    file: "gpx/praguehalf.gpx",
    tags: ["half marathon", "czech republic"],
    emoji: "🇨🇿",
    continent: "europe",
    lat: 50.0982,
    lng: 14.4468,
  },
  {
    id: "madrid-half",
    name: "Medio Maratón de Madrid",
    location: "Madrid, Spain",
    distance: "21.1 km",
    schedule: { month: 4, week: 1, day: 0 }, // 1st Sunday of April
    file: "gpx/madridhalf.gpx",
    tags: ["half marathon", "spain"],
    emoji: "🇪🇸",
    continent: "europe",
    lat: 40.4244,
    lng: -3.6913,
  },
  {
    id: "barcelona-half",
    name: "Mitja Marató Barcelona",
    location: "Barcelona, Spain",
    distance: "21.1 km",
    schedule: { month: 2, week: 3, day: 0 }, // 3rd Sunday of February
    file: "gpx/barcelonahalf.gpx",
    tags: ["half marathon", "spain"],
    emoji: "🇪🇸",
    continent: "europe",
    lat: 41.3869,
    lng: 2.1840,
  },
  {
    id: "hamburg-half",
    name: "Hamburg Half Marathon",
    location: "Hamburg, Germany",
    distance: "21.1 km",
    schedule: { month: 6, week: "last", day: 0 }, // last Sunday of June
    file: "gpx/hamburghalf.gpx",
    tags: ["half marathon", "germany"],
    emoji: "🇩🇪",
    continent: "europe",
    lat: 53.5497,
    lng: 9.9639,
  },
  {
    id: "brighton-half",
    name: "Brighton Half Marathon",
    location: "Brighton, England",
    distance: "21.1 km",
    schedule: { month: 3, week: 1, day: 0 }, // 1st Sunday of March
    file: "gpx/brightonhalf.gpx",
    tags: ["half marathon", "uk"],
    emoji: "🇬🇧",
    continent: "europe",
    lat: 50.8236,
    lng: -0.1624,
  },
  {
    id: "cardiff-half",
    name: "Cardiff Half Marathon",
    location: "Cardiff, Wales",
    distance: "21.1 km",
    schedule: { month: 10, week: 1, day: 0 }, // 1st Sunday of October
    file: "gpx/cardiffhalf.gpx",
    tags: ["half marathon", "uk"],
    emoji: "🏴󠁧󠁢󠁷󠁬󠁳󠁿",
    continent: "europe",
    lat: 51.4811,
    lng: -3.1817,
  },
  {
    id: "napoli-half",
    name: "Napoli City Half Marathon",
    location: "Naples, Italy",
    distance: "21.1 km",
    schedule: { month: 2, week: "last", day: 0 }, // last Sunday of February
    file: "gpx/napolihalf.gpx",
    tags: ["half marathon", "italy"],
    emoji: "🇮🇹",
    continent: "europe",
    lat: 40.8224,
    lng: 14.1886,
  },
  {
    id: "warsaw-half",
    name: "Warsaw Half Marathon",
    location: "Warsaw, Poland",
    distance: "21.1 km",
    schedule: { month: 3, week: "last", day: 0 }, // last Sunday of March
    file: "gpx/warsawhalf.gpx",
    tags: ["half marathon", "poland"],
    emoji: "🇵🇱",
    continent: "europe",
    lat: 52.2369,
    lng: 21.0455,
  },
  {
    id: "budapest-half",
    name: "Budapest Half Marathon",
    location: "Budapest, Hungary",
    distance: "21.1 km",
    schedule: { month: 4, week: 3, day: 0 }, // 3rd Sunday of April
    file: "gpx/budapesthalf.gpx",
    tags: ["half marathon", "hungary"],
    emoji: "🇭🇺",
    continent: "europe",
    lat: 47.5323,
    lng: 19.0499,
  },
];

// Compute the `date` string for each race dynamically
RACES.forEach(r => {
  if (r.schedule) {
    r.date = formatRaceDate(getNextRaceDate(r.schedule));
  }
});
