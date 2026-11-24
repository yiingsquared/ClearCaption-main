import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text().primaryKey(), email: text().notNull().unique(), name: text().notNull(),
  password: text().notNull(), salt: text().notNull(),
});
export const tokens = sqliteTable('tokens', {
  hash: text().primaryKey(), user_id: text().notNull(), expires: integer().notNull(),
});
export const rooms = sqliteTable('rooms', {
  id: text().primaryKey(), code: text().notNull().unique(), owner: text().notNull(),
  title: text().notNull(), language: text().notNull(), started: integer().notNull(),
  ended: integer(), demo: integer().notNull().default(0),
});
export const members = sqliteTable('members', {
  hash: text().primaryKey(), room_id: text().notNull(), expires: integer().notNull(),
});
export const segments = sqliteTable('segments', {
  id: text().primaryKey(), room_id: text().notNull(), text: text().notNull(),
  translations: text().notNull().default('{}'), time: integer().notNull(), created: integer().notNull(),
});
export const saved = sqliteTable('saved', {
  id: text().primaryKey(), user_id: text().notNull(), title: text().notNull(),
  data: text().notNull(), updated: integer().notNull(),
});
export const limits = sqliteTable('limits', {
  key: text().primaryKey(), count: integer().notNull(), expires: integer().notNull(),
});
