import create from "./create";
import deleteRoute from "./delete";
import list from "./list";

export const environmentVariables = {
  create,
  list,
  delete: deleteRoute,
};
