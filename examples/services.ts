/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { z } from "zod";
import { sql, type SQLDefinition } from "../src/index";
import { db } from "./db";
import {
  getActorById,
  getAllActors,
  getFilmsByActor,
  getFilmsWithCategory,
  insertActor,
  linkActorToFilm,
} from "./operations";

/** Fetches an actor and all films they appear in. */
export const getActorFilmography = async (actorId: number) => {
  const actor = await db.client.queryOne(getActorById({ actorId }));
  const films = await db.client.query(getFilmsByActor({ actorId }));

  return { actor, films };
};

/** Looks up an actor that may not exist. */
export const findActor = async (actorId: number) => {
  return db.client.queryOneOrNone(getActorById({ actorId }));
};

/** Lists all actors. */
export const listActors = async () => {
  return db.client.query(getAllActors({}));
};

/** Lists films in a given category. */
export const listFilmsByCategory = async (categoryName: string) => {
  return db.client.query(getFilmsWithCategory({ categoryName }));
};

/**
 * Search films with optional filters.
 * Demonstrates dynamic WHERE composition with nested sql.
 */
export const searchFilms = async (filters: {
  title?: string;
  minRate?: number;
  maxRate?: number;
}) => {
  const conditions: SQLDefinition[] = [];

  if (filters.title !== undefined) {
    conditions.push(sql`f.title ILIKE ${`%${filters.title}%`}`);
  }
  if (filters.minRate !== undefined) {
    conditions.push(sql`f.rental_rate >= ${filters.minRate}`);
  }
  if (filters.maxRate !== undefined) {
    conditions.push(sql`f.rental_rate <= ${filters.maxRate}`);
  }

  let query = sql`SELECT f.* FROM film f`;

  if (conditions.length > 0) {
    let where = conditions[0]!;
    for (let i = 1; i < conditions.length; i++) {
      where = sql`${where} AND ${conditions[i]!}`;
    }
    query = sql`${query} WHERE ${where}`;
  }

  query = sql`${query} ORDER BY f.title`;

  return db.client.query(
    query,
    z.object({
      film_id: z.number(),
      title: z.string(),
      release_year: z.number(),
      rental_rate: z.coerce.number(),
    }),
  );
};

/**
 * Creates an actor and links them to a film inside a transaction.
 * If anything fails, both the insert and the link are rolled back.
 */
export const hireActorForFilm = async (
  firstName: string,
  lastName: string,
  filmId: number,
) => {
  return db.transact(async (tx) => {
    const actor = await tx.queryOne(insertActor({ firstName, lastName }));
    await tx.nonQuery(linkActorToFilm({ actorId: actor.actor_id, filmId }));
    return actor;
  });
};
