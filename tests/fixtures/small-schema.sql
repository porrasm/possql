CREATE TABLE users (
  user_id   integer  PRIMARY KEY,
  name      text     NOT NULL,
  email     text     NOT NULL,
  active    boolean
);

CREATE TABLE posts (
  post_id   integer  PRIMARY KEY,
  user_id   integer  NOT NULL REFERENCES users(user_id),
  title     text     NOT NULL,
  body      text
);
