-- Covers enum types and enum array types.

CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'done');
CREATE TYPE severity AS ENUM ('info', 'warning', 'error', 'fatal');

CREATE TABLE task (
  task_id   integer      PRIMARY KEY,
  title     text         NOT NULL,
  status    task_status  NOT NULL,
  severity  severity,
  tags      severity[]   NOT NULL,
  history   task_status[]
);
