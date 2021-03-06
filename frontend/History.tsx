
import React, { useState } from 'react';
import { Box, Flex, Heading, Icon, Tag, TagLabel, TagLeftIcon, Text, Tooltip } from '@chakra-ui/react';
import { FaCaretRight, FaRegCheckCircle, FaRegCircle, FaRegClock, FaRegEdit } from 'react-icons/fa';
import { useAsyncEffect } from './lib/react';
import { duration, cmpBy, groupBy, toDateLS, toTimeLS } from './lib/util';
import { db, db_union } from './api'; // api to db on server
import { Time, TodoMutation, historyOpt, ModelName } from '../shared/db';
import { maxW, user } from './App';

// initial data from db replaced by the server:
const dbTimes: Time[] = [];
const dbTodoMutations: TodoMutation[] = [];


// We want to have the union of (Time and TodoMutation) ordered by at (DateTime) desc.
// First approach was to merge the two sorted lists from the server into one locally.

// Then tried to do it with one query on the server. The following works (but not supported by Prisma):
  // select *, null as "text", null as "done" from "Time" union all select "todoId", "at", null as "end", "text", "done" from "TodoMutation" order by "at" desc;
  // -> not good since 'union' requires the same number of fields and compatible types, so we have to replace fields of other tables with null
// Better alternative because it works generically without padding fields (but requires extra field to avoid accidental joins):
  // select * from (select *, 'Time' as "table" from "Time") as "t1"
  // natural full join (select *, 'TodoMutation' as "table" from "TodoMutation") as "t2" order by "at" desc;
// Can prefix with 'explain analyze' to see execution plan.
// -> implemented as raw query in db_union, see https://github.com/prisma/prisma/issues/2505#issuecomment-785283427
// But raw queries lack the prisma features like include which we use below.
// Then tried to implement unionFindMany which should also merge several queries and sort them, but on the server.
// Works, but argument is not type-safe and return type is not influenced by the argument.

// So we keep the local merge for now TODO wait for progress on issue above.

const at = (x: Time | TodoMutation) => x.at.toString();
let i = 0;
const mergeSort = (times: Time[], mutations: TodoMutation[]) => { // O(n*log(n))?
  if (!times.length && !mutations.length) return [];
  // TODO: more efficient merge sort since both are already sorted, see https://wsvincent.com/javascript-merge-two-sorted-arrays/
  console.time(`concat+sort ${i}`);
  const r = [...times, ...mutations].sort(cmpBy(at, 'desc'));
  console.timeEnd(`concat+sort ${i}`);
  i++;
  return r;
};
const toDate = (x: Time | TodoMutation) => toDateLS(new Date(at(x))); // new not composable?
const dbHistory = groupBy(toDate, mergeSort(dbTimes, dbTodoMutations)); // If we do this in History, it is executed 4 times instead of once. However, here it is always executed, not just when History is mounted.

// mutations per todo
const calcPreMu = (mutations: TodoMutation[]) => { // O(n)
  // hashtable to lookup the previous mutation's text to show diff
  let preMu: { [todoId: number]: {at: string; text: string}[] } = {};
  // fill lookup hashtable preMu
  mutations.forEach(m => {
    if (m.text !== null) { // only care about text since done is just inverted
      if (!preMu[m.todoId]) preMu[m.todoId] = [];
      preMu[m.todoId].push({at: m.at.toString(), text: m.text});
    }
  });
  return preMu;
}
const dbPreMu = calcPreMu(dbTodoMutations);

const TimeDetail = ({time}: {time: Time}) => {
  const startDate = new Date(time.at);
  const endDate = new Date(time.end ?? Date.now());
  const seconds = Math.round((endDate.getTime() - startDate.getTime()) / 1000);
  const running = !time.end ? '(running)' : '';
  return <>
    <Tag variant="outline">
      <TagLeftIcon as={FaRegClock} />
      <TagLabel>
        <Tooltip hasArrow label={`until ${toTimeLS(endDate)}`}>{`${duration.format(seconds)}`}</Tooltip>
      </TagLabel>
    </Tag>
    <Text>{running}</Text>
  </>;
};
const MutationIcon = ({mutation}: {mutation: TodoMutation}) => {
  return (<>
    {mutation.done !== null && <Icon as={mutation.done ? FaRegCheckCircle : FaRegCircle} />}
    {mutation.text !== null && <Icon as={FaRegEdit} />}
  </>)
};
function HistoryEntry({timu, preMu}: {timu: Time | TodoMutation, preMu: typeof dbPreMu}) {
  const MutationDetail = ({mutation}: {mutation: TodoMutation}) => { // could pull out, but would need to add preMu
    const index = preMu[mutation.todoId]?.findIndex(({at}) => at == mutation.at.toString());
    const oldText = preMu[mutation.todoId][index+1]?.text ?? '';
    const now = mutation.text != timu.todo.text ? `(now ${timu.todo.text})` : '';
    return <>{oldText}<Icon mb={1} as={FaCaretRight} />{`${mutation.text} ${now}`}</>;
  };
  const time = toTimeLS(new Date(at(timu)));
  return <Flex>
    <Box w={82} fontFamily="'Courier New', monospace">{time}</Box>
    <Box w={95} textAlign="center">
      {'end' in timu
        ? <TimeDetail time={timu} />
        : <MutationIcon mutation={timu} />
      }
    </Box>
    <Box flex="1">
      {'text' in timu && timu.text !== null
        ? <MutationDetail mutation={timu} />
        :
        timu.todo.text
      }
    </Box>
  </Flex>;
}

export default function History() {
  // const [times, setTimes] = useState(dbTimes);
  // const [todoMutations, setTodoMutations] = useState(dbTodoMutations);
  const [history, setHistory] = useState(dbHistory);
  const [preMu, setPreMu] = useState(dbPreMu);
  useAsyncEffect(async () => {
    const opt = {...historyOpt, where: {todo: {userId: user?.id}}};
    const times = await db.time.findMany(opt);
    const mutations = await db.todoMutation.findMany(opt);
    setPreMu(calcPreMu(mutations));
    setHistory(groupBy(toDate, mergeSort(times, mutations)));
    console.log('History reloaded');
    // test union on server (missing include Todo)
    // const hs = await db_union(ModelName.Time, ModelName.TodoMutation)({include: {todo: true}, orderBy: {at: 'desc'}});
    // console.log(hs);
  }, []);
  return (<Box w='100%' maxW={maxW} as="main">
    {!history.length && 'Nothing to show yet...'}
    {history.map((group, _) =>
      <React.Fragment key={group.group}>
        <Heading size="lg">{group.group}</Heading>
        <Box shadow="md" borderWidth="1px" px={3} py={2} mb={4}>
          {group.entries.map(timu =>
            <HistoryEntry timu={timu} preMu={preMu} key={timu.todoId + ('end' in timu ? 't' : 'm') + at(timu)} />)}
        </Box>
      </React.Fragment>
    )}
  </Box>);
}
