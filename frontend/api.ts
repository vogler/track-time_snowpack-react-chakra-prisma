import type { Prisma, PrismaClient } from '@prisma/client'; // types for casting
import { action, actions, Model, model, ModelArg, ModelName, models } from '../shared/db';

// json REST API
type method = 'GET' | 'POST' | 'PUT' | 'DELETE';
// CRUD/REST: Create = POST, Read = GET, Update = PUT, Delete = DELETE
const rest = async (method: method, url: string, json?: {}) => {
  const res = await fetch(url, {
    method,
    headers: {
      // compressed json is fine. no need for protobuf, BSON etc.
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(json), // not allowed for GET
  });
  const rjson = await res.json();
  if (res.status != 200) throw rjson.error || rjson;
  return rjson;
};

// We could just use rest() as defined above, but we want to have the actions with types from Prisma for type-safety and autocomplete!

// old customized concrete db functions on REST endpoint -> removed on server
export namespace db_deprecated {
  type TodoOps = Prisma.TodoDelegate<true>; // true = rejectOnNotFound?
  const req = (method: method) => (args: {}) => rest(method, '/todo', args);
  export const findMany = req('GET') as TodoOps['findMany'];
  const _create = req('POST') as TodoOps['create'];
  const _update = req('PUT') as TodoOps['update'];
  const _delete = req('DELETE') as TodoOps['delete'];
  export const create = (data: Prisma.TodoCreateInput) => _create({ data }); // just for data, but more restrictive
  export const update = ({updatedAt, ...data}: Prisma.TodoWhereUniqueInput & Prisma.TodoUncheckedUpdateInput) => _update({ data, where: { id: data.id } }); // remove updatedAt from object so that it is set by db!
  export const delete_ = (data: Prisma.TodoWhereUniqueInput) => _delete({ where: { id: data.id } });
  // TODO make generic. Can't limit data to interface ..WhereUniqueInput w/o sth like ts-transformer-keys; delete fails if we pass more than id (deleteMany accepts ..WhereInput).
  // export values for types: https://github.com/prisma/prisma/discussions/5291
  // limit fields to exactly the given type: https://gitter.im/Microsoft/TypeScript?at=60107e5d32e01b4f71560129
}

// Generically lift the calls over the network.
type dbm<M extends model> = Pick<PrismaClient[M], action>;

// dbm('model').action runs db.model.action on the server
const dbm = <M extends model> (model: M) : dbm<M> => {
  const lift = <A extends action> (action: A) => ((args: {}) => rest('POST', `/db/${model}/${action}`, args)) as PrismaClient[M][A];
  return Object.fromEntries(actions.map(s => [s, lift(s)]));
};
export const db = Object.fromEntries(models.map(s => [s, dbm(s)])) as { [M in model]: dbm<M> };
// db.todo.findMany().then(console.log);

// @ts-ignore
globalThis.db = db; // for direct db access in Chrome console, TODO remove


// raw queries for actions not supported by prisma
export const db_union_raw = async <m extends ModelName> (...ms: m[]) => await rest('GET', `/db/union-raw/${ms.join(',')}`) as Model<m>[];
// UnionToIntersection<ModelArg<m>> results in never?!
export const db_union = <m extends ModelName> (...ms: m[]) => async (arg: ModelArg<m>) => await rest('POST', `/db/union/${ms.join(',')}`, arg) as Model<m>[];
// db_union(ModelName.Time, ModelName.TodoMutation)({select: {text: true}});
