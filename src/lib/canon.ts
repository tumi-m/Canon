import { profileSchema, type Profile } from "./schema";

/**
 * The seed canon.
 *
 * Until M2/M3 put profiles and entries in Postgres, a canon is a static
 * object. It is parsed through the same zod schema an API write will use, so
 * a seed that breaks the 200-character why rule fails at import rather than in
 * production.
 */
const seed = {
  handle: "tumelo",
  displayName: "tumelo",
  bio: "the content that made me. mostly people making things, badly, until they were good.",
  region: "nz",
  entries: [
    {
      work: { id: "gtav", kind: "youtube", title: "making of gta 1, 1996", url: "https://www.youtube.com/watch?v=7vWSi44ZTSw", youtubeId: "7vWSi44ZTSw", runtime: "6m" },
      why: "proof that world-changing things start scrappy and small.",
      weight: 3, highlighted: true,
    },
    {
      work: { id: "jobs", kind: "youtube", title: "steve jobs 1999 ibook speech", url: "https://www.youtube.com/watch?v=EoM2Y2KO6kU", youtubeId: "EoM2Y2KO6kU", runtime: "15m" },
      why: "watch a man sell a feeling, not a laptop.",
      weight: 2, highlighted: false,
    },
    {
      work: { id: "mark", kind: "youtube", title: "markiplier talks about creativity", url: "https://www.youtube.com/watch?v=W5Irjxu1FVI", youtubeId: "W5Irjxu1FVI", runtime: "30m" },
      why: "the most honest thing ever said about making stuff for people.",
      weight: 3, highlighted: false,
    },
    {
      work: { id: "mine", kind: "youtube", title: "minecraft: the story of mojang", url: "https://www.youtube.com/watch?v=ggCIGOQloY4", youtubeId: "ggCIGOQloY4", runtime: "1hr 47m" },
      why: "one stubborn idea, built in public, becomes a universe.",
      weight: 3, highlighted: false,
    },
    {
      work: { id: "hl2", kind: "youtube", title: "half life 2 documentary", url: "https://www.youtube.com/watch?v=YCjNT9qGjh4", youtubeId: "YCjNT9qGjh4", runtime: "2hr 1m" },
      why: "chaos, lawsuits, leaks — and they still shipped a masterpiece.",
      weight: 2, highlighted: false,
    },
    {
      work: { id: "fish", kind: "youtube", title: "day in the life of a korean fish cake vendor", url: "https://www.youtube.com/watch?v=8ygECjUfc5g", youtubeId: "8ygECjUfc5g", runtime: "24m" },
      why: "mastery has nothing to do with scale.",
      weight: 3, highlighted: true,
    },
    {
      work: { id: "dogs", kind: "youtube", title: "old japanese man's hot dog cart", url: "https://www.youtube.com/watch?v=VHkwt6yxVWk", youtubeId: "VHkwt6yxVWk", runtime: "30m" },
      why: "my #1 inspo isn't a tech guy. it's this man.",
      weight: 3, highlighted: false,
    },
    {
      work: { id: "case", kind: "youtube", title: "casey moves from la to nyc", url: "https://www.youtube.com/watch?v=igZ6PoZAszQ", youtubeId: "igZ6PoZAszQ", runtime: "7m" },
      why: "seven minutes that make you want to change your life.",
      weight: 2, highlighted: false,
    },
    {
      work: { id: "star", kind: "youtube", title: "empire of dreams: story of star wars", url: "https://www.youtube.com/watch?v=vB1DA5jZdIQ", youtubeId: "vB1DA5jZdIQ", runtime: "2hr 30m" },
      why: "nobody believed in it. nobody. remember that.",
      weight: 2, highlighted: false,
    },
    {
      work: { id: "port", kind: "youtube", title: "porter robinson — second sky 2021", url: "https://www.youtube.com/watch?v=THjekE5p2aw", youtubeId: "THjekE5p2aw", runtime: "1hr 30m" },
      why: "what it looks like when someone survives their own art.",
      weight: 3, highlighted: false,
    },
    {
      work: { id: "comf", kind: "music", title: "something comforting (music video)", url: "https://www.youtube.com/watch?v=-C-2AqRD8io", youtubeId: "-C-2AqRD8io", runtime: "5m" },
      why: "five minutes of feeling understood.",
      weight: 1, highlighted: false,
    },
    {
      work: { id: "fred", kind: "music", title: "fred again 2024 highlight reel", url: "https://www.youtube.com/watch?v=rsKdmWqXzvQ", youtubeId: "rsKdmWqXzvQ", runtime: "20m" },
      why: "this is just a video of fred… working. that's the point.",
      weight: 2, highlighted: false,
    },
    {
      work: { id: "btls", kind: "tv", title: "the beatles: get back", url: "https://en.wikipedia.org/wiki/The_Beatles:_Get_Back", runtime: "6hr" },
      why: "the beatles weren't geniuses. they were grinders.",
      weight: 3, highlighted: false,
    },
    {
      work: { id: "jiro", kind: "film", title: "jiro dreams of sushi", url: "https://en.wikipedia.org/wiki/Jiro_Dreams_of_Sushi", runtime: "1hr 20m" },
      why: "repetition as devotion. rice as religion.",
      weight: 2, highlighted: false,
    },
    {
      work: { id: "senn", kind: "film", title: "senna", url: "https://en.wikipedia.org/wiki/Senna_(film)", runtime: "1hr 40m" },
      why: "grinding to the top of f1 on pure conviction.",
      weight: 2, highlighted: false,
    },
    {
      work: { id: "miya", kind: "film", title: "the kingdom of dreams and madness", url: "https://en.wikipedia.org/wiki/The_Kingdom_of_Dreams_and_Madness", runtime: "2hr" },
      why: "miyazaki isn't a genius. he's something… else.",
      weight: 3, highlighted: false,
    },
  ],
} as const;

const CANONS: readonly Profile[] = [profileSchema.parse(seed)];

export function getCanon(handle: string): Profile | undefined {
  return CANONS.find((canon) => canon.handle === handle.toLowerCase());
}

export function allHandles(): readonly string[] {
  return CANONS.map((canon) => canon.handle);
}
