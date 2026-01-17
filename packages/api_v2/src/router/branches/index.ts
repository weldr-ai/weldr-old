import advance from "./advance";
import create from "./create";
import deleteRoute from "./delete";
import get from "./get";
import getByIdOrMain from "./get-by-id-or-main";
import getByName from "./get-by-name";
import getMain from "./get-main";
import list from "./list";
import merge from "./merge";
import move from "./move";

export const branches = {
  list,
  get,
  getByIdOrMain,
  getByName,
  getMain,
  create,
  move,
  advance,
  merge,
  delete: deleteRoute,
};
