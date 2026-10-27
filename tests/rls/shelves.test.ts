import { beforeAll, describe, expect, inject, it } from "vitest";
import { admin, as, rowsAs } from "./db";

/**
 * Row level security is the security boundary: these tests are the proof.
 *
 * Negative cases first, everywhere — the thing that matters is who gets zero
 * rows. Each block also has its positive control, so that a policy too strict
 * to let anyone in, or a role with no privileges at all, cannot pass for a
 * correct one.
 */

const url = inject("rlsUrl");

// people
const OWNER = "00000000-0000-4000-8000-00000000000a";
const INVITEE = "00000000-0000-4000-8000-00000000000b";
const STRANGER = "00000000-0000-4000-8000-00000000000c";
const MEMBER = "00000000-0000-4000-8000-00000000000d"; // in the owner's household
const OTHER = "00000000-0000-4000-8000-00000000000e"; // owns another household
const NEIGHBOUR = "00000000-0000-4000-8000-00000000000f"; // in the other household
const NEWCOMER = "00000000-0000-4000-8000-000000000010"; // signed up, no profile yet

const owner = { user: OWNER };
const invitee = { user: INVITEE };
const stranger = { user: STRANGER };
const member = { user: MEMBER };
const neighbour = { user: NEIGHBOUR };
const newcomer = { user: NEWCOMER };

const shelvesSeen = (who: Parameters<typeof rowsAs>[1]) =>
  rowsAs(url, who, "select name from shelves order by name").map(([name]) => name);

const entriesSeen = (who: Parameters<typeof rowsAs>[1]) =>
  rowsAs(url, who, "select s.name from entries e join shelves s on s.id = e.shelf_id order by s.name").map(
    ([name]) => name,
  );

const rlsError = /row-level security/;

beforeAll(() => {
  admin(
    url,
    `
    insert into auth.users (id, email) values
      ('${OWNER}', 'owner@example.com'), ('${INVITEE}', 'invitee@example.com'),
      ('${STRANGER}', 'stranger@example.com'), ('${MEMBER}', 'member@example.com'),
      ('${OTHER}', 'other@example.com'), ('${NEIGHBOUR}', 'neighbour@example.com'),
      ('${NEWCOMER}', 'newcomer@example.com');
    insert into profiles (id, handle, display_name) values
      ('${OWNER}', 'owner', 'Owner'), ('${INVITEE}', 'invitee', 'Invitee'),
      ('${STRANGER}', 'stranger', 'Stranger'), ('${MEMBER}', 'member', 'Member'),
      ('${OTHER}', 'other', 'Other'), ('${NEIGHBOUR}', 'neighbour', 'Neighbour');
    insert into works (kind, title, canonical_url) values ('youtube', 'a film', 'https://example.com/a-film');
    insert into shelves (owner_id, name, slug, audience, opens_at) values
      ('${OWNER}', 'private', 'private', 'private', null),
      ('${OWNER}', 'invited', 'invited', 'invited', null),
      ('${OWNER}', 'household', 'household', 'household', null),
      ('${OWNER}', 'everyone', 'everyone', 'everyone', null),
      ('${OWNER}', 'sealed capsule', 'sealed', 'invited', now() + interval '1 year'),
      ('${OWNER}', 'opened capsule', 'opened', 'invited', now() - interval '1 day'),
      ('${OTHER}', 'their household', 'theirs', 'household', null);
    insert into invites (shelf_id, invitee_email, invitee_id)
      select id, 'invitee@example.com', '${INVITEE}' from shelves
      where name in ('invited', 'sealed capsule', 'opened capsule');
    insert into household_members (household_owner_id, member_id) values
      ('${OWNER}', '${MEMBER}'), ('${OTHER}', '${NEIGHBOUR}');
    insert into entries (shelf_id, work_id, why)
      select s.id, w.id, 'because it changed how I see things' from shelves s, works w;
    insert into notes (entry_id, author_id, body)
      select e.id, '${OWNER}', 'a note' from entries e join shelves s on s.id = e.shelf_id
      where s.name in ('private', 'everyone');
    `,
  );
});

describe("every table", () => {
  it("has row level security switched on — checked in the catalogue, not by reading the migration", () => {
    const off = admin(
      url,
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    expect(off).toEqual([]);
    const tables = admin(url, `select count(*) from pg_tables where schemaname = 'public'`);
    expect(tables).toEqual([["8"]]);
  });
});

describe("who sees which shelf", () => {
  it("an anonymous visitor sees only what is open to everyone", () => {
    expect(shelvesSeen("anon")).toEqual(["everyone"]);
  });

  it("a stranger gets zero rows from a private shelf, an invited one, or a household's", () => {
    expect(shelvesSeen(stranger)).toEqual(["everyone"]);
  });

  it("an invitee gets zero rows from a capsule before its date — not a blurred teaser, nothing", () => {
    const seen = shelvesSeen(invitee);
    expect(seen).not.toContain("sealed capsule");
    expect(seen).not.toContain("private");
    expect(seen).not.toContain("household");
    // the positive control: the shelves they were invited to, and the capsule once it opens
    expect(seen).toEqual(["everyone", "invited", "opened capsule"]);
  });

  it("a household member gets zero rows from another household's shelf", () => {
    expect(shelvesSeen(member)).toEqual(["everyone", "household"]);
    expect(shelvesSeen(neighbour)).toEqual(["everyone", "their household"]);
  });

  it("the owner sees every shelf of their own, the sealed capsule included", () => {
    expect(shelvesSeen(owner)).toEqual([
      "everyone",
      "household",
      "invited",
      "opened capsule",
      "private",
      "sealed capsule",
    ]);
  });
});

describe("what is on them", () => {
  it("an anonymous visitor gets zero entries from any shelf not open to everyone", () => {
    expect(entriesSeen("anon")).toEqual(["everyone"]);
  });

  it("a stranger gets zero entries from shelves they were not let into", () => {
    expect(entriesSeen(stranger)).toEqual(["everyone"]);
  });

  it("an invitee gets zero entries from a sealed capsule, and the opened one's are theirs", () => {
    expect(entriesSeen(invitee)).toEqual(["everyone", "invited", "opened capsule"]);
  });

  it("notes follow their shelf", () => {
    const notes = (who: Parameters<typeof rowsAs>[1]) =>
      rowsAs(
        url,
        who,
        `select s.name from notes n join entries e on e.id = n.entry_id join shelves s on s.id = e.shelf_id order by s.name`,
      ).map(([name]) => name);
    expect(notes(stranger)).toEqual(["everyone"]);
    expect(notes(owner)).toEqual(["everyone", "private"]);
  });

  it("who is invited, and who lives in a household, is nobody else's business", () => {
    expect(rowsAs(url, stranger, "select 1 from invites")).toEqual([]);
    expect(rowsAs(url, stranger, "select 1 from household_members")).toEqual([]);
    expect(rowsAs(url, "anon", "select 1 from invites")).toEqual([]);
    // positive controls: your own invitations, your own household, your own guest list
    expect(rowsAs(url, invitee, "select count(*) from invites")).toEqual([["3"]]);
    expect(rowsAs(url, member, "select count(*) from household_members")).toEqual([["1"]]);
    expect(rowsAs(url, owner, "select count(*) from invites")).toEqual([["3"]]);
  });
});

describe("writes", () => {
  it("nobody can put something on somebody else's shelf", () => {
    const result = as(
      url,
      stranger,
      `insert into entries (shelf_id, work_id, why)
       select s.id, w.id, 'mine now' from shelves s, works w where s.name = 'everyone'`,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(rlsError);
  });

  it("a shelf you can see is not a shelf you can change", () => {
    expect(rowsAs(url, stranger, "update shelves set name = 'mine' where name = 'everyone' returning id")).toEqual([]);
    expect(rowsAs(url, stranger, "delete from entries returning id")).toEqual([]);
    // positive control: the owner can
    expect(rowsAs(url, owner, "update shelves set name = 'renamed' where name = 'everyone' returning name")).toEqual([
      ["renamed"],
    ]);
  });

  it("nobody can make or change a profile that is not theirs", () => {
    const forged = as(url, stranger, `insert into profiles (id, handle, display_name) values ('${NEWCOMER}', 'forged', 'Forged')`);
    expect(forged.ok).toBe(false);
    if (!forged.ok) expect(forged.error).toMatch(rlsError);
    expect(rowsAs(url, stranger, `update profiles set display_name = 'mine' where id = '${OWNER}' returning id`)).toEqual([]);
    expect(as(url, "anon", `insert into profiles (id, handle, display_name) values ('${NEWCOMER}', 'anon', 'Anon')`).ok).toBe(
      false,
    );
  });

  it("a newcomer can claim a handle for themselves, and only themselves", () => {
    expect(
      rowsAs(url, newcomer, `insert into profiles (id, handle, display_name) values ('${NEWCOMER}', 'newcomer', 'New') returning handle`),
    ).toEqual([["newcomer"]]);
    expect(rowsAs(url, owner, `update profiles set bio = 'hello' where id = '${OWNER}' returning bio`)).toEqual([["hello"]]);
  });

  it("a profile is readable by anyone holding the link — a handle has to resolve", () => {
    expect(rowsAs(url, "anon", "select handle from profiles where handle = 'owner'")).toEqual([["owner"]]);
  });

  it("the catalogue of works takes additions only from signed-in people, and availability from nobody", () => {
    expect(as(url, "anon", `insert into works (kind, title, canonical_url) values ('other', 'x', 'https://example.com/x')`).ok).toBe(
      false,
    );
    expect(
      as(url, stranger, `insert into works (kind, title, canonical_url) values ('other', 'x', 'https://example.com/x')`).ok,
    ).toBe(true);
    const work = admin(url, "select id from works limit 1")[0]![0];
    expect(
      as(url, stranger, `insert into availability (work_id, region, payload) values ('${work}', 'gb', '{}')`).ok,
    ).toBe(false);
  });
});

describe("the database's own limits", () => {
  // the third place the caps are enforced, and the only one that cannot be skipped
  const attempt = (sql: string) => as(url, owner, sql);

  it("a handle is 3–20 of a–z, 0–9 and _, and unique whatever its case", () => {
    const claim = (handle: string) =>
      as(url, newcomer, `insert into profiles (id, handle, display_name) values ('${NEWCOMER}', '${handle}', 'N')`);
    expect(claim("ab").ok).toBe(false);
    expect(claim("tu mi").ok).toBe(false);
    expect(claim("a".repeat(21)).ok).toBe(false);
    const taken = claim("OWNER");
    expect(taken.ok).toBe(false);
    if (!taken.ok) expect(taken.error).toMatch(/duplicate key/);
    expect(claim("fresh_1").ok).toBe(true);
  });

  it("a why is at most 200 characters, and a note at most 300", () => {
    const why = (n: number) =>
      attempt(`update entries set why = '${"w".repeat(n)}' where shelf_id = (select id from shelves where name = 'private')`);
    expect(why(201).ok).toBe(false);
    expect(why(200).ok).toBe(true);
    const note = (n: number) => attempt(`update notes set body = '${"n".repeat(n)}'`);
    expect(note(301).ok).toBe(false);
    expect(note(300).ok).toBe(true);
  });
});
