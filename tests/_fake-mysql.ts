/**
 * _fake-mysql.ts
 *
 * Banco MySQL em memória, só o bastante para rodar de verdade as funções
 * `server/db-*.ts` da Fase 4 em teste. Os filtros (`where`) que o Drizzle monta
 * são lidos pelo SQL que ele gera, então um filtro errado no código de produção
 * (coluna trocada, `and` no lugar de `or`, estado esquecido) faz o teste falhar.
 * Um fake que só devolve resultados em fila não pega nada disso.
 *
 * Suporta o que essas funções usam:
 *  - select / insert / update / delete em tabelas do `drizzle/schema.ts`;
 *  - where com and/or, =, <>, <, <=, >, >=, in, not in, is null, is not null, e
 *    coluna contra coluna; orderBy asc/desc; limit; projeção `select({ a: t.a })`;
 *  - `select(...).for("update")` dentro de transação: trava por tabela+filtro até
 *    a transação terminar (é o que serializa dois pedidos para o mesmo idoso);
 *  - transação com desfazer ao lançar erro;
 *  - default (autoincremento, `defaultNow`, valor fixo), unicidade e `onUpdateNow`.
 * Cada operação cede a vez ao laço de eventos, para chamadas concorrentes se
 * intercalarem como num banco de verdade.
 *
 * Não é um banco: sem join, sem agregação, sem `offset`. Se uma função de produção
 * precisar disso, o fake lança "não suportado" em vez de adivinhar.
 */
import { getTableColumns, getTableName, is, SQL } from "drizzle-orm";
import { MySqlDialect } from "drizzle-orm/mysql-core";

export type Row = Record<string, any>;

const dialect = new MySqlDialect();
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** Data no formato em que o Drizzle entrega parâmetros de timestamp ao driver. */
function formatDate(d: Date): string {
  return d.toISOString().replace("T", " ").replace("Z", "");
}

const comparable = (v: unknown): unknown => (v instanceof Date ? formatDate(v) : v);

// --- where: lê o SQL gerado pelo Drizzle ---------------------------------------

type Pred = (row: Row, params: unknown[]) => boolean;

const TOKEN = /\s*(\(|\)|`[^`]+`\.`[^`]+`|<=|>=|<>|!=|=|<|>|\?|,|[A-Za-z_]+)/y;

function tokenize(sql: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while (TOKEN.lastIndex < sql.length && (m = TOKEN.exec(sql))) tokens.push(m[1]);
  if (TOKEN.lastIndex < sql.trimEnd().length) throw new Error(`fake-mysql: SQL não suportado: ${sql}`);
  return tokens;
}

function compile(sql: string): Pred {
  const tokens = tokenize(sql);
  let pos = 0;
  let nextParam = 0;
  const peek = () => tokens[pos];
  const take = () => tokens[pos++];
  const expect = (t: string) => {
    if (take() !== t) throw new Error(`fake-mysql: esperava "${t}" em: ${sql}`);
  };

  type Operand = (row: Row, params: unknown[]) => unknown;
  const operand = (): Operand => {
    const t = take();
    if (t === "?") {
      const index = nextParam++;
      return (_row, params) => params[index];
    }
    const column = /^`[^`]+`\.`([^`]+)`$/.exec(t);
    if (!column) throw new Error(`fake-mysql: operando não suportado "${t}" em: ${sql}`);
    return (row) => row[column[1]];
  };

  const comparison = (): Pred => {
    const left = operand();
    let op = take().toLowerCase();
    let negate = false;
    if (op === "not") {
      negate = true;
      op = take().toLowerCase();
    }
    if (op === "in") {
      expect("(");
      const items: Operand[] = [operand()];
      while (peek() === ",") {
        take();
        items.push(operand());
      }
      expect(")");
      return (row, params) => {
        const hit = items.some((i) => comparable(i(row, params)) === comparable(left(row, params)));
        return negate ? !hit : hit;
      };
    }
    if (op === "is") {
      let isNot = false;
      if (peek().toLowerCase() === "not") {
        take();
        isNot = true;
      }
      expect("null");
      return (row, params) => {
        const v = left(row, params);
        const isNull = v === null || v === undefined;
        return isNot ? !isNull : isNull;
      };
    }
    const right = operand();
    return (row, params) => {
      const a = comparable(left(row, params)) as any;
      const b = comparable(right(row, params)) as any;
      switch (op) {
        case "=":
          return a === b;
        case "<>":
        case "!=":
          return a !== b;
        case "<":
          return a < b;
        case "<=":
          return a <= b;
        case ">":
          return a > b;
        case ">=":
          return a >= b;
        default:
          throw new Error(`fake-mysql: operador não suportado "${op}" em: ${sql}`);
      }
    };
  };

  const atom = (): Pred => {
    if (peek() === "(") {
      take();
      const inner = or();
      expect(")");
      return inner;
    }
    return comparison();
  };
  const and = (): Pred => {
    const parts = [atom()];
    while (peek()?.toLowerCase() === "and") {
      take();
      parts.push(atom());
    }
    return (row, params) => parts.every((p) => p(row, params));
  };
  const or = (): Pred => {
    const parts = [and()];
    while (peek()?.toLowerCase() === "or") {
      take();
      parts.push(and());
    }
    return (row, params) => parts.some((p) => p(row, params));
  };

  const root = or();
  if (pos !== tokens.length) throw new Error(`fake-mysql: sobrou SQL sem entender: ${sql}`);
  return root;
}

function whereFilter(condition: unknown): { test: (row: Row) => boolean; key: string } {
  if (condition === undefined) return { test: () => true, key: "" };
  const { sql, params } = dialect.sqlToQuery(condition as SQL);
  const pred = compile(sql);
  return { test: (row) => pred(row, params), key: `${sql}|${JSON.stringify(params)}` };
}

// --- o banco ---------------------------------------------------------------------

type Lock = { release: () => void };

export class FakeMysql {
  private data = new Map<string, Row[]>();
  private autoIncrement = new Map<string, number>();
  private locks = new Map<string, Promise<void>>();
  /** Resumo de cada comando, na ordem: `select users for update`, `insert alarm_management`… */
  readonly log: string[] = [];

  /** Linhas atuais da tabela (cópia). */
  rows(table: string): Row[] {
    return (this.data.get(table) ?? []).map((r) => structuredClone(r));
  }

  /** Planta linhas já prontas (sem defaults); atualiza o autoincremento. */
  seed(table: string, rows: Row[]): void {
    const list = this.data.get(table) ?? [];
    for (const row of rows) {
      list.push(structuredClone(row));
      if (typeof row.id === "number") {
        this.autoIncrement.set(table, Math.max(this.autoIncrement.get(table) ?? 0, row.id));
      }
    }
    this.data.set(table, list);
  }

  private list(table: string): Row[] {
    let list = this.data.get(table);
    if (!list) {
      list = [];
      this.data.set(table, list);
    }
    return list;
  }

  private snapshot(): Map<string, Row[]> {
    return new Map([...this.data].map(([k, v]) => [k, structuredClone(v)]));
  }

  // select -----------------------------------------------------------------------

  select = (fields?: Record<string, any>, tx?: TxState) => {
    const q: {
      table?: string;
      where?: unknown;
      order: Array<{ column: string; dir: "asc" | "desc" }>;
      limit?: number;
      lock: boolean;
    } = { order: [], lock: false };
    const builder: any = {
      from: (table: any) => {
        q.table = getTableName(table);
        return builder;
      },
      where: (condition: unknown) => {
        q.where = condition;
        return builder;
      },
      orderBy: (...parts: any[]) => {
        for (const p of parts) {
          if (is(p, SQL)) {
            const m = /^`[^`]+`\.`([^`]+)` (asc|desc)$/.exec(dialect.sqlToQuery(p).sql);
            if (!m) throw new Error("fake-mysql: orderBy não suportado");
            q.order.push({ column: m[1], dir: m[2] as "asc" | "desc" });
          } else {
            q.order.push({ column: p.name, dir: "asc" });
          }
        }
        return builder;
      },
      limit: (n: number) => {
        q.limit = n;
        return builder;
      },
      for: (strength: string) => {
        if (strength !== "update") throw new Error("fake-mysql: só for('update')");
        q.lock = true;
        return builder;
      },
      then: (resolve: (v: Row[]) => void, reject: (e: unknown) => void) =>
        this.runSelect(q, fields, tx).then(resolve, reject),
    };
    return builder;
  };

  private async runSelect(
    q: { table?: string; where?: unknown; order: Array<{ column: string; dir: "asc" | "desc" }>; limit?: number; lock: boolean },
    fields: Record<string, any> | undefined,
    tx: TxState | undefined,
  ): Promise<Row[]> {
    if (!q.table) throw new Error("fake-mysql: select sem from()");
    const filter = whereFilter(q.where);
    if (q.lock) {
      if (!tx) throw new Error("fake-mysql: for('update') fora de transação");
      await this.acquire(`${q.table}|${filter.key}`, tx);
      this.log.push(`select ${q.table} for update`);
    } else {
      this.log.push(`select ${q.table}`);
    }
    await tick();
    let rows = this.list(q.table).filter(filter.test);
    for (const { column, dir } of [...q.order].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = comparable(a[column]) as any;
        const y = comparable(b[column]) as any;
        return (x < y ? -1 : x > y ? 1 : 0) * (dir === "asc" ? 1 : -1);
      });
    }
    if (q.limit !== undefined) rows = rows.slice(0, q.limit);
    if (!fields) return rows.map((r) => structuredClone(r));
    return rows.map((r) =>
      Object.fromEntries(Object.entries(fields).map(([alias, column]) => [alias, structuredClone(r[column.name])])),
    );
  }

  private async acquire(key: string, tx: TxState): Promise<void> {
    if (tx.held.has(key)) return;
    while (this.locks.has(key)) await this.locks.get(key);
    let release!: () => void;
    const promise = new Promise<void>((resolve) => (release = resolve));
    this.locks.set(key, promise);
    tx.held.set(key, {
      release: () => {
        this.locks.delete(key);
        release();
      },
    });
  }

  // insert -----------------------------------------------------------------------

  insert = (table: any, tx?: TxState) => ({
    values: (values: Row | Row[]) => ({
      then: (resolve: (v: any) => void, reject: (e: unknown) => void) =>
        this.runInsert(table, Array.isArray(values) ? values : [values], tx).then(resolve, reject),
    }),
  });

  private async runInsert(table: any, values: Row[], tx?: TxState) {
    const name = getTableName(table);
    this.log.push(`insert ${name}`);
    await tick();
    this.beforeWrite(tx);
    const columns = getTableColumns(table) as Record<string, any>;
    let insertId = 0;
    for (const value of values) {
      const row: Row = {};
      for (const [key, column] of Object.entries(columns)) {
        let v = value[key];
        if (v === undefined) {
          if (column.autoIncrement) {
            v = (this.autoIncrement.get(name) ?? 0) + 1;
          } else if (column.hasDefault) {
            v = is(column.default, SQL) ? new Date() : (column.default ?? null);
          } else {
            v = column.notNull ? undefined : null;
          }
        }
        if (v !== undefined && v !== null && typeof v === "object" && !(v instanceof Date)) v = structuredClone(v);
        row[key] = v;
      }
      for (const [key, column] of Object.entries(columns)) {
        if (column.notNull && (row[key] === undefined || row[key] === null)) {
          throw Object.assign(new Error(`Column '${key}' cannot be null`), { code: "ER_BAD_NULL_ERROR" });
        }
        if (column.isUnique && row[key] != null && this.list(name).some((r) => r[key] === row[key])) {
          throw Object.assign(new Error(`Duplicate entry for ${name}.${key}`), { code: "ER_DUP_ENTRY" });
        }
      }
      if (typeof row.id === "number") {
        insertId = row.id;
        this.autoIncrement.set(name, Math.max(this.autoIncrement.get(name) ?? 0, row.id));
      }
      this.list(name).push(row);
    }
    return [{ insertId, affectedRows: values.length }, undefined];
  }

  // update / delete --------------------------------------------------------------

  update = (table: any, tx?: TxState) => ({
    set: (values: Row) => ({
      where: (condition?: unknown) => ({
        then: (resolve: (v: any) => void, reject: (e: unknown) => void) =>
          this.runUpdate(table, values, condition, tx).then(resolve, reject),
      }),
    }),
  });

  private async runUpdate(table: any, values: Row, condition: unknown, tx?: TxState) {
    const name = getTableName(table);
    this.log.push(`update ${name}`);
    await tick();
    this.beforeWrite(tx);
    const columns = getTableColumns(table) as Record<string, any>;
    const filter = whereFilter(condition);
    let affected = 0;
    for (const row of this.list(name).filter(filter.test)) {
      const before = structuredClone(row);
      for (const [key, value] of Object.entries(values)) {
        if (is(value, SQL)) {
          const copy = /^`[^`]+`\.`([^`]+)`$/.exec(dialect.sqlToQuery(value).sql);
          if (!copy) throw new Error("fake-mysql: expressão no set() não suportada");
          row[key] = row[copy[1]];
        } else {
          row[key] = value !== null && typeof value === "object" && !(value instanceof Date) ? structuredClone(value) : value;
        }
      }
      const changed = Object.keys(row).some((k) => JSON.stringify(row[k]) !== JSON.stringify(before[k]));
      if (changed) {
        for (const [key, column] of Object.entries(columns)) {
          if (column.hasOnUpdateNow === true && !(key in values)) row[key] = new Date();
        }
      }
      affected++;
    }
    return [{ affectedRows: affected }, undefined];
  }

  delete = (table: any, tx?: TxState) => ({
    where: (condition?: unknown) => ({
      then: (resolve: (v: any) => void, reject: (e: unknown) => void) =>
        this.runDelete(table, condition, tx).then(resolve, reject),
    }),
  });

  private async runDelete(table: any, condition: unknown, tx?: TxState) {
    const name = getTableName(table);
    this.log.push(`delete ${name}`);
    await tick();
    this.beforeWrite(tx);
    const filter = whereFilter(condition);
    const list = this.list(name);
    const keep = list.filter((r) => !filter.test(r));
    const affected = list.length - keep.length;
    this.data.set(name, keep);
    return [{ affectedRows: affected }, undefined];
  }

  // transação --------------------------------------------------------------------

  /** Guarda o estado logo antes da PRIMEIRA escrita da transação (para desfazer se ela falhar). */
  private beforeWrite(tx?: TxState): void {
    if (tx && !tx.snapshot) tx.snapshot = this.snapshot();
  }

  transaction = async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
    const state: TxState = { held: new Map<string, Lock>() };
    const tx = {
      select: (fields?: Record<string, any>) => this.select(fields, state),
      insert: (table: any) => this.insert(table, state),
      update: (table: any) => this.update(table, state),
      delete: (table: any) => this.delete(table, state),
    };
    try {
      return await fn(tx);
    } catch (err) {
      if (state.snapshot) this.data = state.snapshot;
      throw err;
    } finally {
      for (const lock of state.held.values()) lock.release();
    }
  };
}

type TxState = { held: Map<string, Lock>; snapshot?: Map<string, Row[]> };
