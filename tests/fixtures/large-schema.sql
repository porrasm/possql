-- Covers all DEFAULT_ZOD_TYPE_MAP and DEFAULT_ZOD_ARRAY_TYPE_MAP types.
-- Table names are singular so that ${table_name}_id PK detection works.

CREATE TABLE category (
  category_id integer PRIMARY KEY,
  name        text    NOT NULL
);

CREATE TABLE big_number (
  big_number_id bigint PRIMARY KEY,
  label         text   NOT NULL
);

CREATE TABLE profile (
  profile_id   integer  PRIMARY KEY,
  display_name text     NOT NULL,
  bio          text,
  is_public    boolean  NOT NULL
);

CREATE TABLE event (
  event_id    integer                  PRIMARY KEY,
  name        text                     NOT NULL,
  starts_at   timestamp with time zone NOT NULL,
  ends_at     timestamp with time zone,
  local_start timestamp without time zone,
  event_date  date
);

CREATE TABLE product (
  product_id  integer           PRIMARY KEY,
  name        text              NOT NULL,
  sku         character varying NOT NULL,
  price       numeric           NOT NULL,
  weight      double precision
);

CREATE TABLE file (
  file_id     uuid  PRIMARY KEY,
  name        text  NOT NULL,
  content     bytea NOT NULL,
  object_oid  oid
);

CREATE TABLE location (
  location_id integer PRIMARY KEY,
  name        text    NOT NULL,
  coords      point
);

CREATE TABLE setting (
  setting_id integer PRIMARY KEY,
  key        text    NOT NULL,
  value      jsonb   NOT NULL
);

CREATE TABLE tag (
  tag_id integer PRIMARY KEY,
  name   text    NOT NULL
);

CREATE TABLE article (
  article_id  integer  PRIMARY KEY,
  category_id integer  NOT NULL REFERENCES category(category_id),
  profile_id  integer  REFERENCES profile(profile_id),
  title       text     NOT NULL,
  body        text,
  published   boolean  NOT NULL,
  view_count  integer  NOT NULL
);

CREATE TABLE article_tag (
  article_tag_id integer PRIMARY KEY,
  article_id     integer NOT NULL REFERENCES article(article_id),
  tag_id         integer NOT NULL REFERENCES tag(tag_id)
);

CREATE TABLE int_array (
  int_array_id integer   PRIMARY KEY,
  name         text      NOT NULL,
  values       integer[]
);

CREATE TABLE text_array (
  text_array_id integer  PRIMARY KEY,
  name          text     NOT NULL,
  labels        text[]
);
