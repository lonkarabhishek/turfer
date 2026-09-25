// Real turf snapshot used by blog articles' related-turfs blocks.
// Sourced live from Supabase `public.turfs` on 2026-09-25; every id
// links to /turf/[id] on tapturf.in. Do NOT invent rows. If you need
// a venue not listed, query the DB and add it here — never hard-code
// unverified names, ratings or cover URLs into an article.
//
// Fields intentionally kept minimal — we don't try to mirror the full
// Turf shape here, because writing articles is the source of intent
// and the live turf page is the source of truth. Rating/reviews are
// snapshot values; the live turf card always shows current numbers.

export interface BlogTurf {
  id: string;
  name: string;
  area: string;   // human area label ("Kothrud", "Aundh, Baner Link Rd")
  city: "nashik" | "pune" | "mumbai";
  rating: number | null;
  reviews: number | null;
  coverImage: string | null;
}

export const BLOG_TURFS: Record<string, BlogTurf> = {
  // ── Pune football ─────────────────────────────────────────────
  "788b7f84-df97-4eee-99e3-a1ec0281c487": {
    id: "788b7f84-df97-4eee-99e3-a1ec0281c487",
    name: "Forza Football",
    area: "Anand Nagar",
    city: "pune",
    rating: 4.5,
    reviews: 1394,
    coverImage: null, // stored as 32x32 thumb; falls back to gradient card
  },
  "aa4c9c4f-d806-4c2b-adcc-f10340768d4f": {
    id: "aa4c9c4f-d806-4c2b-adcc-f10340768d4f",
    name: "Solaris Sports World",
    area: "Kothrud",
    city: "pune",
    rating: 4.3,
    reviews: 1898,
    coverImage: null,
  },
  "ce569765-2ceb-41f0-95d7-57e97615895c": {
    id: "ce569765-2ceb-41f0-95d7-57e97615895c",
    name: "Reboot Sports Arena",
    area: "Hinjewadi",
    city: "pune",
    rating: 4.1,
    reviews: 1442,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWnJ3BRsjoQ-Gemiu0l5LehALpPzk8vLNiB3HDK7IrU4kBsJVXIKPlFC8DjYcAowr5IEr_0c0X73cqnUx9hdgQ0s3BopOPu64ULLO-oJ2TVWJD1R8IYZtAxsGGnw0nN884SsbdW0PA=w1600-h1200-k-no",
  },
  "a6d7b7ec-3e62-4d7e-812d-1b093dc59b97": {
    id: "a6d7b7ec-3e62-4d7e-812d-1b093dc59b97",
    name: "High Score FC",
    area: "Kothrud",
    city: "pune",
    rating: 4.3,
    reviews: 847,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWntTs4zI6ZZxsxgaMc-5JscVMRq2BleBYxspg29mnoQFirhw41bOD6Gf6UQIMIhkGOC2zPI5qyXE-nlzUf-UdUBKo6vUnof-g4ukItP6gkLqkkQYq7SlMvXH1TPVvRjK8cdXEwM=w1200-h900-k-no",
  },
  "1430e9c6-eefc-416a-bfb7-4315026bdaf9": {
    id: "1430e9c6-eefc-416a-bfb7-4315026bdaf9",
    name: "Silver Sports Club Wakad",
    area: "Wakad",
    city: "pune",
    rating: 4.2,
    reviews: 917,
    coverImage: null,
  },
  "d4a6030f-cabd-44e6-8c36-88204731b5c3": {
    id: "d4a6030f-cabd-44e6-8c36-88204731b5c3",
    name: "Hindu Gymkhana Kothrud",
    area: "Kothrud",
    city: "pune",
    rating: 4.7,
    reviews: 387,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWlPL2EQV01NCudSoiSATDF6MpeE3DqOY8O8EpjMLcQ05-cA8qlISzieQjJO6KCk6O_s2ps7iw2L-TGssT11JB26TG9UX5vGCKhjnRVhZqT2ojetwAA3vYlPxNF0hKzeO1_EuHfAuOvIcyZi=w1200-h900-k-no",
  },
  "bed1ebe4-78fc-4c42-acc0-4e911436f81d": {
    id: "bed1ebe4-78fc-4c42-acc0-4e911436f81d",
    name: "The Turf Ground",
    area: "Kothrud",
    city: "pune",
    rating: 4.6,
    reviews: 437,
    coverImage: "https://files.yappe.in/place/full/the-turf-ground-4279055.webp",
  },
  "9185a6c0-18f7-47ec-bdd4-9a65d73e7312": {
    id: "9185a6c0-18f7-47ec-bdd4-9a65d73e7312",
    name: "Crossbar Multisports Arena",
    area: "Anand Nagar",
    city: "pune",
    rating: 4.2,
    reviews: 609,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWk3F1xf7jYoQ2oDpC3EEMv9Of5uxd0V6bEkglELjn48j3q8WM78c3pXG9fkAFyj9LW4KVec94terRzbIkqIDuyJFg02uBUcUwZP5r60DE2gwfi6C3dOU5Y8YRY93ebHDbVQMikF=w1200-h900-k-no",
  },
  "414d8bcd-4cff-451b-bdb8-75b4bb8a9d2f": {
    id: "414d8bcd-4cff-451b-bdb8-75b4bb8a9d2f",
    name: "The Arena 5A Side Football Turf",
    area: "Aundh",
    city: "pune",
    rating: 4.2,
    reviews: 598,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWkb0N08yUInHP_jMLdk5wwzcB8aijxZsWtbfQs3I9Uc5R8tleSkEN2J4LRjuwHc7Ojt7DeQHlOSNB2KNIpoZVCvjZ1arIS8heSWxUhy-V7BZLKJ_w6k_eRYC7K40Rnfzk6p0zDv2A=w1200-h900-k-no",
  },
  "c22ae155-a6ce-4f85-8979-4948c7cdcb31": {
    id: "c22ae155-a6ce-4f85-8979-4948c7cdcb31",
    name: "Don Bosco Football Turf",
    area: "Yerawada",
    city: "pune",
    rating: 4.3,
    reviews: 514,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWn3pUhf2p0VaxD1XsNL2lNKMGNJp9jtyrGgglcpdRg7GYflv1p9kArxC5B5ibJzsCMQa-fJ96qJRhjaYVedzc63XHzWBf5k8Z8snxnlLXRcqKBxhwy5d7LQDNApnPfkiGZd501p=w1200-h900-k-no",
  },
  "df24d7bc-715b-4a87-b96c-8eec0c6dc178": {
    id: "df24d7bc-715b-4a87-b96c-8eec0c6dc178",
    name: "Derby Sports Turf",
    area: "Karve Nagar",
    city: "pune",
    rating: 4.3,
    reviews: 547,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWnDnNDqblhlMJUZV601kxEVloPVi1qokLwSb7XlaonVCz772VnjbskCSFtfBD41uF2FctloYdALcXzoVPtH7juVbgVsAh9d942ovUVIZrq5fL_MQyF7Sqedpd0o2RYW6jMIZOiF4g=w1200-h900-k-no",
  },
  "f566137a-d655-46e1-be5b-bf05616fd9d5": {
    id: "f566137a-d655-46e1-be5b-bf05616fd9d5",
    name: "Suyash Academy Sports Complex",
    area: "Bavdhan",
    city: "pune",
    rating: 4.1,
    reviews: 556,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWmiItIVUZDN6kLGBJTI8ZfBl1Va15xzsFE_J6Ra9IJILbaueloCUePcGYp5vZFYA8HQFJJemfCigv4cSUHZuYBTC2DTpMSjdCGm1UjFzFpaxro2h_a5HTE3p4FH5BuVRt4UR5moVw=w1200-h900-k-no",
  },
  "15c2145f-c753-40cf-9027-509463e15e58": {
    id: "15c2145f-c753-40cf-9027-509463e15e58",
    name: "WOW Sports And Fitness",
    area: "Katraj",
    city: "pune",
    rating: 4.2,
    reviews: 673,
    coverImage: null,
  },

  // ── Pune pricing (real price rows) ─────────────────────────────
  "47bc4194-18bf-4d66-84f4-ef6463ee9eb7": {
    id: "47bc4194-18bf-4d66-84f4-ef6463ee9eb7",
    name: "Hotfut Kharadi",
    area: "Kharadi",
    city: "pune",
    rating: 4.8,
    reviews: 25,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWluVehlKK7EQC1aLXqA_MlNeKacLkys0f-whXQJmZn_YVq34vLW48k_LAGIVqxfHzCHjp5XnnbNJQXczHBvBChh3aY96gO0B6HQm18Ajne7jRBjwtMYEUkg_5WWzOfRbJ9Wt9Is=w1200-h900-k-no",
  },
  "0677eb38-375b-45b8-b6a4-d0b92bdf8e3c": {
    id: "0677eb38-375b-45b8-b6a4-d0b92bdf8e3c",
    name: "Hotfut Undri",
    area: "Undri",
    city: "pune",
    rating: 4.5,
    reviews: 142,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWkvgUc4J7N4sZS5GI8r-KS90gRr7PhjBNzET7rGCSsYvGRUpN8VRenl0Lnhmts4QHHbTaPZUFxbNIt1foD10d_vrD-xSDZ6FHkdZtb4GwL_BunWoK4H0XeA226-CzMau2Tpmvq9=w1200-h900-k-no",
  },
  "feda49ae-c12c-4791-ad00-f78f8f465678": {
    id: "feda49ae-c12c-4791-ad00-f78f8f465678",
    name: "Hotfut SB Road",
    area: "SB Road",
    city: "pune",
    rating: 4.7,
    reviews: 16,
    coverImage: null,
  },
  "626c5731-6392-475c-a936-ca53f2f0788f": {
    id: "626c5731-6392-475c-a936-ca53f2f0788f",
    name: "MASS x SportLight Sports Arena",
    area: "Bavdhan",
    city: "pune",
    rating: 4.0,
    reviews: 6,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWnCPa-0rtwQ1wfUHZEh-Z2kjfgqHGwUYHX8N7LEgB8it7K9VYeV1tfh7izNQfZoofSguj7J3gpLh9TKTVhdZQbvCp7fkkbqvYRrBfB8NLuGUKhjQtXNFkQwfEbPO7FyyiixFHgxIlcI7GKh=w1200-h900-k-no",
  },

  // ── Pune pickleball ────────────────────────────────────────────
  "6ec71550-63a9-4c4e-bf9d-d54b63405982": {
    id: "6ec71550-63a9-4c4e-bf9d-d54b63405982",
    name: "Chondhe Patil Sports Zone",
    area: "Aundh",
    city: "pune",
    rating: 4.5,
    reviews: 203,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWnY2DbPrbZz0HTS0Irr5Yj5CxtQChaGdHN9OGYOBpbTAOb7fOLv9_aqdasuedIBTx8tdrKVly1zbB5vLyiLvZwhmg81BmMPF0MGN6BoH2CqEkQITQEh3spOmGP5Cgfg3xaqxcEM3w=w1200-h900-k-no",
  },
  "a47b1767-701b-432a-9a55-e6868bab1c7c": {
    id: "a47b1767-701b-432a-9a55-e6868bab1c7c",
    name: "Kaizen Sports",
    area: "Karve Nagar",
    city: "pune",
    rating: 4.7,
    reviews: 47,
    coverImage: null,
  },
  "83bd2e75-0853-46e5-ade7-c5d2d9c60f16": {
    id: "83bd2e75-0853-46e5-ade7-c5d2d9c60f16",
    name: "Rama Sports",
    area: "Kothrud",
    city: "pune",
    rating: 4.2,
    reviews: null,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AHRPTWn5Cn32k-AAwpCk8bya3QcKWsE7z-bKVI4LUc2ZMMELUpDrLv3WZmVLMsqn6FcNwTP2atYO3oR_XS_Lm_UXm6VnKYh87-YAmBhYf9n-wcjcWjU56i31XuI5hlWqZ4SfWLYrDDThiyGjh1U=w1600-h1200-k-no",
  },

  // ── Nashik cricket / box cricket ──────────────────────────────
  "a2638e0d-ef2f-4b79-a8e6-745335fc0ab7": {
    id: "a2638e0d-ef2f-4b79-a8e6-745335fc0ab7",
    name: "The SSK World Club",
    area: "Pathardi Phata",
    city: "nashik",
    rating: 4.5,
    reviews: 825,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AG0ilSw8YbrKRfjR9eWH420KI3dZ5yNEiqQXHynkma_QD6r-giUlzI8GfDwp9MqRXKmEf_rOY0vC4JVajyxIFrmFbiRsF0LIrZ9yljivX_dymBxO_rxtTkmCS2RVVhPaCuwbe0w2mMtJqw=s1360-w1360-h1020-rw",
  },
  "cfd6a391-643b-4158-919c-d599751806e8": {
    id: "cfd6a391-643b-4158-919c-d599751806e8",
    name: "NIWEC Club",
    area: "Satpur",
    city: "nashik",
    rating: 4.3,
    reviews: 2170,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AG0ilSz-nkzxkbJjZ-EDGIDkm-21fkTpo8AiJkJrjh62jl1cPQeuB7Iif4IOhbZ05L7O0ysBfxsFLQx1I8-e6iR1YMny2UtsqEAXTFUHe-Y9-j8Jkbthm0xUK0coPjV_pMfuMliyvTd6yQ=s1360-w1360-h1020-rw",
  },
  "0ee6f4dd-011c-4540-a958-1adb6a4f23a2": {
    id: "0ee6f4dd-011c-4540-a958-1adb6a4f23a2",
    name: "Big Bounce Turf",
    area: "Govind Nagar",
    city: "nashik",
    rating: 4.4,
    reviews: 448,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AG0ilSzyQUzk9_g6gwobDNfK3Ouwx4Zh0QlBvJA3srw8ASotw2RPTrk5P3u242cb_tbWLUjZT-Sr5LPPQrKnTBfzpSirIF64poCdLKHCwMpPP-R4Kjl_MtQH4KJMY6g0Ts-66ZSdX4ys=s1360-w1360-h1020-rw",
  },
  "d284445e-9811-420b-9d55-e6359229f7ed": {
    id: "d284445e-9811-420b-9d55-e6359229f7ed",
    name: "Chatrapati Shivaji Maharaj Cricket Turf",
    area: "Dattanagar",
    city: "nashik",
    rating: 4.9,
    reviews: 177,
    coverImage:
      "https://lh3.googleusercontent.com/gps-cs-s/AG0ilSx_DnvOgrhcM2SXqDsZRpdTXLfbxLZg7QKvcUZLJqoH_82At-DHFvzOpUDoH6DM612hLG34bS-DF1tbZrtEQTyQZoPz0avy_fE6Tamx5-FIcZvt1ImurgBlIAQNihwlzwz1EhtNfw=s1360-w1360-h1020-rw",
  },
  "22aef796-e805-44f7-8e0c-57535ca9ba29": {
    id: "22aef796-e805-44f7-8e0c-57535ca9ba29",
    name: "Galaxy Sports Club",
    area: "Savarkar Nagar",
    city: "nashik",
    rating: 4.4,
    reviews: 289,
    coverImage: null,
  },
  "a85e1e72-74ea-4fbc-9dd9-2a5316940f2d": {
    id: "a85e1e72-74ea-4fbc-9dd9-2a5316940f2d",
    name: "Box Park Turf",
    area: "Mumbai Naka",
    city: "nashik",
    rating: 4.2,
    reviews: 412,
    coverImage:
      "https://lh3.googleusercontent.com/p/AF1QipMrsWgd5tU2JQAFdhgcxJmo6xCPJWdMmaZnf_Dc=s1360-w1360-h1020-rw",
  },
  "338a4058-9148-49db-8555-7d8fe47f926c": {
    id: "338a4058-9148-49db-8555-7d8fe47f926c",
    name: "The Home Ground Turf",
    area: "Asaram Bapu Bridge",
    city: "nashik",
    rating: 4.5,
    reviews: 265,
    coverImage:
      "https://lh3.googleusercontent.com/p/AF1QipNk6jly_fTa4U5NQTOZSvMtyh24haU8qMYTE934=s1360-w1360-h1020-rw",
  },
};

export function getBlogTurf(id: string): BlogTurf | undefined {
  return BLOG_TURFS[id];
}
