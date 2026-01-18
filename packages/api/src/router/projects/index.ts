import create from "./create";
import deleteRoute from "./delete";
import get from "./get";
import list from "./list";
import update from "./update";

export default {
  create,
  list,
  get,
  update,
  delete: deleteRoute,
};
