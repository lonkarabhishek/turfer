// The live URL of every turf the blog links to. Read from Supabase
// public.turfs (id, slug, is_active) on 2026-10-28. Turf pages live at
// /turf/<slug>; /turf/<id> still works but answers with a 308, so a card
// that links by id sends Google through a redirect. null means the turf
// is no longer listed: its page is a 404, so the card shows without a
// link. A block may give the slug itself as its id (newer posts do).
// A database id that is not here yet links by id (still correct);
// check:blog warns until its slug is added.

export const BLOG_TURF_SLUGS: Record<string, string | null> = {
  "01e4188b-cc4f-4526-b985-92c7a19374a4": "kridadham-premium-multisport-club-rane-nagar",
  "03778bf6-61de-4899-8e19-302709d89539": "the-sports-foundry-bhandup-west",
  "0677eb38-375b-45b8-b6a4-d0b92bdf8e3c": "hotfut-undri",
  "0d25fca4-48c3-4ce0-be43-a5f63c2111ff": "the-royal-multisports-turf-vaiduwadi",
  "0db1419d-69aa-4085-b28a-513121746c7b": "offside-kowkoor",
  "0ee6f4dd-011c-4540-a958-1adb6a4f23a2": "big-bounce-turf-govind-nagar",
  "1430e9c6-eefc-416a-bfb7-4315026bdaf9": "silver-sports-club-wakad",
  "15c2145f-c753-40cf-9027-509463e15e58": "wow-sports-and-fitness-pune",
  "164e9d20-7fdf-4cd0-9bb0-d5a9a7bdd338": "huddle-arena-chembur-164e9d",
  "188d72fe-27dc-4c89-a9b7-932e1f417fab": "lucky-sports-hub-andheri-east",
  "1ed5b7c7-aff6-4358-a024-fd61ebad2f90": "run-bhumi-turf-sangharsh-nagar",
  "202e7a76-cd7c-4fbb-af93-ac9d22b6d2b3": "athlon-sports-india-mulund-west",
  "22aef796-e805-44f7-8e0c-57535ca9ba29": "galaxy-sports-club-savarkar-nagar",
  "2406797d-e0ad-4c53-b929-64715ab4be19": "cap-club-panvel-multi-sport-turf-ground",
  "27841faf-6fe3-4e9b-9699-847f40f2db77": "vedant-sports-academy-tathawade",
  "2a2ebf1f-7140-40c7-86ed-615fec395d0f": "mm-box-cricket-hayathnagar",
  "2c7244f5-d586-4b8e-b62e-484751ab18fc": "cc-turf-pardi",
  "2ddd0809-2038-4ece-b830-03e54fc6c0e1": "shree-balaji-turf-nandanvan",
  "30cc2746-c679-4715-a1aa-d9eef42bb64c": "champion-s-turf-amrutdham",
  "31e07fe7-89ca-4111-967c-63d6171149c3": "asr-sports-arena-bolarum",
  "338a4058-9148-49db-8555-7d8fe47f926c": "the-home-ground-turf-nashik",
  "37dbd368-0803-40dc-997f-9e897a1df18d": "the-pavilion-sports-arena-anant-nagar",
  "414d8bcd-4cff-451b-bdb8-75b4bb8a9d2f": "the-arena-5a-side-football-turf-aundh",
  "47bc4194-18bf-4d66-84f4-ef6463ee9eb7": "hotfut-kharadi",
  "488e5b3c-f4e5-44d4-9df1-1847619a2c48": "turfstation-juhu",
  "4a0d9997-e49d-42aa-b5d9-b464c95282a0": "nexgen-box-cricket-cafe-suraram",
  "500ce1a8-4766-417c-865f-8e259d1a445c": "goalster-st-joseph-s-sports-complex-bandra-west",
  "5205ba6f-9e9b-468d-89f6-e420f2b1a5cc": "huddle-arena-chembur-5205ba",
  "5a5aade6-e8e6-48d5-b331-8aba60d0ebc4": "score-andheri-east",
  "61a9c568-2299-4fef-a8e0-dd9ed95bc96e": "xciteplay-club-association-kt-nagar",
  "626c5731-6392-475c-a936-ca53f2f0788f": "mass-x-sportlight-sports-arena-bavdhan",
  "64f42c48-a72e-4976-886b-63f2a983eef7": "city-turf-thane-west",
  "69a2a825-f57e-4c93-9fdf-e405df79cbd7": "arena32-pune",
  "6ec71550-63a9-4c4e-bf9d-d54b63405982": "chondhe-patil-sports-zone-aundh",
  "7701d4fe-93bb-4ad1-ad87-bb03f4f66c63": "kridabhumi-the-multisports-turf-dwarka",
  "788b7f84-df97-4eee-99e3-a1ec0281c487": "forza-football-pune",
  "7d3ad87f-ec32-446d-8c19-566c2d9e4528": "sk-sports-club-bhagur",
  "7fd40a88-1697-431b-90e8-cece9527ce40": "the-turf-cafe-sports-arena-kondapur",
  "83bd2e75-0853-46e5-ade7-c5d2d9c60f16": "rama-sports-kothrud",
  "8985dc7a-7301-45d3-aa95-5ac1a12a40c5": "the-zion-multisports-turf-jaripatka",
  "8b1a463b-ff9e-4fad-af90-7ae6a4f97b2d": "astro-park-st-stanislaus-sports-complex-bandra-west",
  "8db1627b-3020-4a12-823f-f4ad4f529d73": "gamepoint-shoreline-kompally",
  "8e093ade-71ee-45f9-a7cd-2b7401512f20": "nahata-sports-complex-sinhagad-road",
  "916a6158-6626-45f2-b22f-4e1686bf5bf7": "highball-sports-complex-himayatnagar",
  "9185a6c0-18f7-47ec-bdd4-9a65d73e7312": "crossbar-multisports-arena-pune",
  "92795e26-a834-4b86-8e80-63a43807fc00": "night-riders-sanath-nagar",
  "965187d3-e8de-4673-9f02-ae765baf965a": "cc-turf-ram-nagar-hill-top",
  "96e877c1-7461-4d14-a290-8f4d71307b46": "nexus-arena-2-0-mira-road-east",
  "9db16006-8301-45cf-a285-348d11c056bf": "amy-sports-arena-kukatpally",
  "9f1c6c34-5fe8-4928-8303-b5a9696f854d": "sk-sports-arena-somalwada",
  "a0505199-c162-425b-b546-58aec3250806": "aangan-the-multisport-s-turf-deolali",
  "a2638e0d-ef2f-4b79-a8e6-745335fc0ab7": "ssk-world-club-pathardi",
  "a47b1767-701b-432a-9a55-e6868bab1c7c": "kaizen-sports-karve-nagar",
  "a6d7b7ec-3e62-4d7e-812d-1b093dc59b97": "high-score-fc-kothrud",
  "a85e1e72-74ea-4fbc-9dd9-2a5316940f2d": "box-park-turf-mumbai-naka",
  "a9ad5fa5-4302-45fd-9a78-5a7cda518193": "cc-turf-manish-nagar",
  "aa499603-03ab-409c-9927-8ccaac3ef855": "turfgully-manish-nagar",
  // Solaris Sports World, Kothrud: no longer listed (is_active false on 28 Oct).
  "aa4c9c4f-d806-4c2b-adcc-f10340768d4f": null,
  "abaea1dc-0b0c-4f55-b097-5b6b0437a574": "ss-turf-nagpur-pipla-fata",
  "bed1ebe4-78fc-4c42-acc0-4e911436f81d": "the-turf-ground-kothrud",
  "c22ae155-a6ce-4f85-8979-4948c7cdcb31": "don-bosco-football-turf-yerawada",
  "ca0fd5e4-b146-4df2-89f7-12181af4ef73": "aarambh-turf-box-cricket-nashik",
  "ca4d1da1-c844-4659-8554-9b75ac2b00b4": "new-nashik-gymkhana-cricket-academy-indira-nagar",
  "ce569765-2ceb-41f0-95d7-57e97615895c": "reboot-sports-arena-hinjewadi",
  "cfd6a391-643b-4158-919c-d599751806e8": "niwec-club-satpur",
  "d033ec2d-ad3a-447a-98a4-79b677ef55fb": "ranangan-the-multisport-s-best-turf-in-nashik-trimbak-road",
  "d284445e-9811-420b-9d55-e6359229f7ed": "chatrapati-shivaji-maharaj-cricket-turf-naikwadipura",
  "d4a6030f-cabd-44e6-8c36-88204731b5c3": "hindu-gymkhana-kothrud",
  "d69fea11-51a9-4c58-bd1c-1a60bf5e03d2": "greenfield-the-multisport-turf-panchavati",
  "dbb7daeb-0767-49a2-9e6b-e63246bba13b": "legends-sports-club-zingabai-takli",
  "df24d7bc-715b-4a87-b96c-8eec0c6dc178": "derby-sports-turf-karve-nagar",
  "e18ba038-3fab-47fd-a05f-50ddef7bc7a9": "turfpark-st-andrews-bandra-west",
  "e215d8aa-21f5-4125-aafa-855bea6796f9": "turfpark-tmc-thane-west",
  "e4873fcc-61df-442f-8ca5-6edb39055aa1": "gss-lords-big-box-cricket-kukatpally",
  "e852b2cf-ae73-4f53-8412-2f8e60271a71": "prime-turf-marol",
  "ea68a33f-aa9f-4a23-a40b-0591bf336880": "the-paddock-turf-erandwane",
  "ecb69cb0-3131-4977-86a4-1bda9501e034": "paddlewave-sports-arena-kondapur",
  "ed8feb98-bf17-4f98-9292-f304c5366519": "aj-cricket-club-box-cricket-mettakanigudem",
  "f3389955-353b-46f7-8864-a6af512cfb46": "dn-parande-football-and-cricket-turf-dhanori",
  "f566137a-d655-46e1-be5b-bf05616fd9d5": "suyash-academy-sports-complex-bavdhan",
  "feda49ae-c12c-4791-ad00-f78f8f465678": "hotfut-sb-road-senapati-bapat-road",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a turf block's id is a database id with no slug recorded here (newer posts give the slug itself). */
export function linksByRedirect(id: string): boolean {
  return UUID.test(id) && !Object.prototype.hasOwnProperty.call(BLOG_TURF_SLUGS, id);
}

/** Where a blog card for this turf links: its slug URL (a block may name the slug itself), its id URL when the slug isn't recorded yet, or null when the turf is no longer listed. */
export function blogTurfHref(id: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(BLOG_TURF_SLUGS, id)) return `/turf/${id}`;
  const slug = BLOG_TURF_SLUGS[id];
  return slug ? `/turf/${slug}` : null;
}
