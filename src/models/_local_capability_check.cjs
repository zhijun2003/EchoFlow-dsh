"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from2, except, desc) => {
  if (from2 && typeof from2 === "object" || typeof from2 === "function") {
    for (let key of __getOwnPropNames(from2))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from2[key], enumerable: !(desc = __getOwnPropDesc(from2, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// echoflowai-tools/src/models/_local_capability_check.ts
var import_strict = __toESM(require("node:assert/strict"), 1);

// echoflowai-tools/node_modules/@deepseek-ai/cosmokit/lib/index.js
function isNullable(value) {
  return value === null || value === void 0;
}
function isPlainObject(data) {
  return data && typeof data === "object" && !Array.isArray(data);
}
function filterKeys(object, filter) {
  return Object.fromEntries(Object.entries(object).filter(([key, value]) => filter(key, value)));
}
function mapValues(object, transform) {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, transform(value, key)]));
}
function pick(source, keys, forced) {
  if (!keys) return { ...source };
  const result = {};
  for (const key of keys) if (forced || source[key] !== void 0) result[key] = source[key];
  return result;
}
function defineProperty(object, key, value) {
  return Object.defineProperty(object, key, {
    writable: true,
    value,
    enumerable: false
  });
}
function is(type, value) {
  if (arguments.length === 1) return (value2) => is(type, value2);
  return type in globalThis && value instanceof globalThis[type] || Object.prototype.toString.call(value).slice(8, -1) === type;
}
function isArrayBufferLike(value) {
  return is("ArrayBuffer", value) || is("SharedArrayBuffer", value);
}
function isArrayBufferSource(value) {
  return isArrayBufferLike(value) || ArrayBuffer.isView(value);
}
var Binary;
(function(Binary2) {
  Binary2.is = isArrayBufferLike;
  Binary2.isSource = isArrayBufferSource;
  function fromSource(source) {
    if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
    else return source;
  }
  Binary2.fromSource = fromSource;
  function toBase64(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("base64");
    let binary = "";
    const bytes = new Uint8Array(source);
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  Binary2.toBase64 = toBase64;
  function fromBase64(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "base64"));
    return Uint8Array.from(atob(source), (c) => c.charCodeAt(0));
  }
  Binary2.fromBase64 = fromBase64;
  function toHex(source) {
    source = fromSource(source);
    if (typeof Buffer !== "undefined") return Buffer.from(source).toString("hex");
    return Array.from(new Uint8Array(source), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  Binary2.toHex = toHex;
  function fromHex(source) {
    if (typeof Buffer !== "undefined") return fromSource(Buffer.from(source, "hex"));
    const hex = source.length % 2 === 0 ? source : source.slice(0, source.length - 1);
    const buffer = [];
    for (let i = 0; i < hex.length; i += 2) buffer.push(parseInt(`${hex[i]}${hex[i + 1]}`, 16));
    return Uint8Array.from(buffer).buffer;
  }
  Binary2.fromHex = fromHex;
})(Binary || (Binary = {}));
var base64ToArrayBuffer = Binary.fromBase64;
var arrayBufferToBase64 = Binary.toBase64;
var hexToArrayBuffer = Binary.fromHex;
var arrayBufferToHex = Binary.toHex;
function clone(source, refs = /* @__PURE__ */ new Map()) {
  if (!source || typeof source !== "object") return source;
  if (is("Date", source)) return new Date(source.valueOf());
  if (is("RegExp", source)) return new RegExp(source.source, source.flags);
  if (isArrayBufferLike(source)) return source.slice(0);
  if (ArrayBuffer.isView(source)) return source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
  const cached = refs.get(source);
  if (cached) return cached;
  if (Array.isArray(source)) {
    const result2 = [];
    refs.set(source, result2);
    source.forEach((value, index) => {
      result2[index] = Reflect.apply(clone, null, [value, refs]);
    });
    return result2;
  }
  const result = Object.create(Object.getPrototypeOf(source));
  refs.set(source, result);
  for (const key of Reflect.ownKeys(source)) {
    const descriptor = { ...Reflect.getOwnPropertyDescriptor(source, key) };
    if ("value" in descriptor) descriptor.value = Reflect.apply(clone, null, [descriptor.value, refs]);
    Reflect.defineProperty(result, key, descriptor);
  }
  return result;
}
function deepEqual(a, b, strict) {
  if (a === b) return true;
  if (!strict && isNullable(a) && isNullable(b)) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (!a || !b) return false;
  function check(test, then) {
    return test(a) ? test(b) ? then(a, b) : false : test(b) ? false : void 0;
  }
  return check(Array.isArray, (a2, b2) => a2.length === b2.length && a2.every((item, index) => deepEqual(item, b2[index]))) ?? check(is("Date"), (a2, b2) => a2.valueOf() === b2.valueOf()) ?? check(is("RegExp"), (a2, b2) => a2.source === b2.source && a2.flags === b2.flags) ?? check(isArrayBufferLike, (a2, b2) => {
    if (a2.byteLength !== b2.byteLength) return false;
    const viewA = new Uint8Array(a2);
    const viewB = new Uint8Array(b2);
    for (let i = 0; i < viewA.length; i++) if (viewA[i] !== viewB[i]) return false;
    return true;
  }) ?? Object.keys({
    ...a,
    ...b
  }).every((key) => deepEqual(a[key], b[key], strict));
}
function tokenize(source, delimiters, delimiter) {
  const output = [];
  let state2 = 0;
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    if (code >= 65 && code <= 90) {
      if (state2 === 1) {
        const next = source.charCodeAt(i + 1);
        if (next >= 97 && next <= 122) output.push(delimiter);
        output.push(code + 32);
      } else {
        if (state2 !== 0) output.push(delimiter);
        output.push(code + 32);
      }
      state2 = 1;
    } else if (code >= 97 && code <= 122) {
      output.push(code);
      state2 = 2;
    } else if (delimiters.includes(code)) {
      if (state2 !== 0) output.push(delimiter);
      state2 = 0;
    } else output.push(code);
  }
  return String.fromCharCode(...output);
}
function paramCase(source) {
  return tokenize(source, [45, 95], 45);
}
var hyphenate = paramCase;
var Time;
(function(Time2) {
  Time2.millisecond = 1;
  Time2.second = 1e3;
  Time2.minute = Time2.second * 60;
  Time2.hour = Time2.minute * 60;
  Time2.day = Time2.hour * 24;
  Time2.week = Time2.day * 7;
  let timezoneOffset = (/* @__PURE__ */ new Date()).getTimezoneOffset();
  function setTimezoneOffset(offset) {
    timezoneOffset = offset;
  }
  Time2.setTimezoneOffset = setTimezoneOffset;
  function getTimezoneOffset() {
    return timezoneOffset;
  }
  Time2.getTimezoneOffset = getTimezoneOffset;
  function getDateNumber(date2 = /* @__PURE__ */ new Date(), offset) {
    if (typeof date2 === "number") date2 = new Date(date2);
    if (offset === void 0) offset = timezoneOffset;
    return Math.floor((date2.valueOf() / Time2.minute - offset) / 1440);
  }
  Time2.getDateNumber = getDateNumber;
  function fromDateNumber(value, offset) {
    const date2 = new Date(value * Time2.day);
    if (offset === void 0) offset = timezoneOffset;
    return new Date(+date2 + offset * Time2.minute);
  }
  Time2.fromDateNumber = fromDateNumber;
  const numeric = /\d+(?:\.\d+)?/.source;
  const timeRegExp = new RegExp(`^${[
    "w(?:eek(?:s)?)?",
    "d(?:ay(?:s)?)?",
    "h(?:our(?:s)?)?",
    "m(?:in(?:ute)?(?:s)?)?",
    "s(?:ec(?:ond)?(?:s)?)?"
  ].map((unit) => `(${numeric}${unit})?`).join("")}$`);
  function parseTime(source) {
    const capture = timeRegExp.exec(source);
    if (!capture) return 0;
    return (parseFloat(capture[1]) * Time2.week || 0) + (parseFloat(capture[2]) * Time2.day || 0) + (parseFloat(capture[3]) * Time2.hour || 0) + (parseFloat(capture[4]) * Time2.minute || 0) + (parseFloat(capture[5]) * Time2.second || 0);
  }
  Time2.parseTime = parseTime;
  function parseDate(date2) {
    const parsed = parseTime(date2);
    if (parsed) date2 = Date.now() + parsed;
    else if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).toLocaleDateString()}-${date2}`;
    else if (/^\d{1,2}-\d{1,2}-\d{1,2}(:\d{1,2}){1,2}$/.test(date2)) date2 = `${(/* @__PURE__ */ new Date()).getFullYear()}-${date2}`;
    return date2 ? new Date(date2) : /* @__PURE__ */ new Date();
  }
  Time2.parseDate = parseDate;
  function format(ms) {
    const abs = Math.abs(ms);
    if (abs >= Time2.day - Time2.hour / 2) return Math.round(ms / Time2.day) + "d";
    else if (abs >= Time2.hour - Time2.minute / 2) return Math.round(ms / Time2.hour) + "h";
    else if (abs >= Time2.minute - Time2.second / 2) return Math.round(ms / Time2.minute) + "m";
    else if (abs >= Time2.second) return Math.round(ms / Time2.second) + "s";
    return ms + "ms";
  }
  Time2.format = format;
  function toDigits(source, length = 2) {
    return source.toString().padStart(length, "0");
  }
  Time2.toDigits = toDigits;
  function template(template2, time = /* @__PURE__ */ new Date()) {
    return template2.replace("yyyy", time.getFullYear().toString()).replace("yy", time.getFullYear().toString().slice(2)).replace("MM", toDigits(time.getMonth() + 1)).replace("dd", toDigits(time.getDate())).replace("hh", toDigits(time.getHours())).replace("mm", toDigits(time.getMinutes())).replace("ss", toDigits(time.getSeconds())).replace("SSS", toDigits(time.getMilliseconds(), 3));
  }
  Time2.template = template;
})(Time || (Time = {}));

// echoflowai-tools/node_modules/@deepseek-ai/cordis/lib/index.js
var DisposableList = class {
  sn = 0;
  map = /* @__PURE__ */ new Map();
  weak = /* @__PURE__ */ new WeakMap();
  get length() {
    return this.map.size;
  }
  push(value) {
    const sn = ++this.sn;
    this.map.set(sn, value);
    this.weak.set(value, sn);
    return () => this.map.delete(sn);
  }
  delete(value) {
    const sn = this.weak.get(value);
    if (!sn) return false;
    return this.map.delete(sn);
  }
  clear() {
    const values = [...this.map.values()];
    this.map.clear();
    return values.reverse();
  }
  [Symbol.iterator]() {
    return this.map.values();
  }
  [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
    return [...this];
  }
};
var symbols = {
  shadow: /* @__PURE__ */ Symbol.for("cordis.shadow"),
  receiver: /* @__PURE__ */ Symbol.for("cordis.receiver"),
  original: /* @__PURE__ */ Symbol.for("cordis.original"),
  metadata: /* @__PURE__ */ Symbol.for("cordis.metadata"),
  initHooks: /* @__PURE__ */ Symbol.for("cordis.initHooks"),
  checkProto: /* @__PURE__ */ Symbol.for("cordis.checkProto"),
  effect: /* @__PURE__ */ Symbol.for("cordis.effect"),
  filter: /* @__PURE__ */ Symbol.for("cordis.filter"),
  isolate: /* @__PURE__ */ Symbol.for("cordis.isolate"),
  intercept: /* @__PURE__ */ Symbol.for("cordis.intercept"),
  init: /* @__PURE__ */ Symbol.for("cordis.init"),
  check: /* @__PURE__ */ Symbol.for("cordis.check"),
  config: /* @__PURE__ */ Symbol.for("cordis.config"),
  invoke: /* @__PURE__ */ Symbol.for("cordis.invoke"),
  extend: /* @__PURE__ */ Symbol.for("cordis.extend"),
  tracker: /* @__PURE__ */ Symbol.for("cordis.tracker"),
  resolveConfig: /* @__PURE__ */ Symbol.for("cordis.resolveConfig")
};
var GeneratorFunction = function* () {
}.constructor;
var AsyncGeneratorFunction = async function* () {
}.constructor;
function isConstructor(func) {
  if (!func.prototype) return false;
  if (func instanceof GeneratorFunction) return false;
  if (AsyncGeneratorFunction !== Function && func instanceof AsyncGeneratorFunction) return false;
  return true;
}
function joinPrototype(proto1, proto2) {
  if (proto1 === Object.prototype) return proto2;
  const result = Object.create(joinPrototype(Object.getPrototypeOf(proto1), proto2));
  for (const key of Reflect.ownKeys(proto1)) Object.defineProperty(result, key, Object.getOwnPropertyDescriptor(proto1, key));
  return result;
}
function isObject(value) {
  return value && (typeof value === "object" || typeof value === "function");
}
function getPropertyDescriptor(target, prop) {
  let proto = target;
  while (proto) {
    const desc = Reflect.getOwnPropertyDescriptor(proto, prop);
    if (desc) return desc;
    proto = Object.getPrototypeOf(proto);
  }
}
function getTraceable(ctx2, value) {
  if (!isObject(value)) return value;
  if (Object.hasOwn(value, symbols.shadow)) return Object.getPrototypeOf(value);
  const tracker = value[symbols.tracker];
  if (!tracker) return value;
  return createTraceable(ctx2, value, tracker);
}
function withProps(target, props) {
  if (!props) return target;
  return new Proxy(target, {
    get: (target2, prop, receiver) => {
      if (prop in props && prop !== "constructor") return Reflect.get(props, prop, receiver);
      return Reflect.get(target2, prop, receiver);
    },
    set: (target2, prop, value, receiver) => {
      if (prop in props && prop !== "constructor") return Reflect.set(props, prop, value, receiver);
      return Reflect.set(target2, prop, value, receiver);
    }
  });
}
function withProp(target, prop, value) {
  return withProps(target, Object.defineProperty(/* @__PURE__ */ Object.create(null), prop, {
    value,
    writable: false
  }));
}
function createShadow(ctx2, target, property2, receiver) {
  if (!property2) return receiver;
  const origin = Reflect.getOwnPropertyDescriptor(target, property2)?.value;
  if (!origin) return receiver;
  return withProp(receiver, property2, ctx2.extend({ [symbols.shadow]: origin }));
}
function createShadowMethod(ctx2, value, outer, shadow) {
  return new Proxy(value, { apply: (target, thisArg, args) => {
    if (thisArg === outer) thisArg = shadow;
    return getTraceable(ctx2, Reflect.apply(target, thisArg, args));
  } });
}
function createTraceable(ctx2, value, tracker) {
  if (ctx2[symbols.shadow] && !tracker.noShadow) ctx2 = Object.getPrototypeOf(ctx2);
  const proxy = new Proxy(value, {
    get: (target, prop, receiver) => {
      if (prop === symbols.original) return target;
      if (prop === tracker.property) return ctx2;
      if (typeof prop === "symbol") return Reflect.get(target, prop, receiver);
      if (tracker.associate && ctx2.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.get(ctx2, `${tracker.associate}.${prop}`, withProp(ctx2, symbols.receiver, receiver));
      let shadow, innerValue;
      const desc = getPropertyDescriptor(target, prop);
      if (desc && "value" in desc) innerValue = desc.value;
      else {
        shadow = createShadow(ctx2, target, tracker.property, receiver);
        innerValue = Reflect.get(target, prop, shadow);
      }
      const innerTracker = innerValue?.[symbols.tracker];
      if (innerTracker) return createTraceable(ctx2, innerValue, innerTracker);
      else if (!tracker.noShadow && typeof innerValue === "function") {
        shadow ??= createShadow(ctx2, target, tracker.property, receiver);
        return createShadowMethod(ctx2, innerValue, receiver, shadow);
      } else return innerValue;
    },
    set: (target, prop, value2, receiver) => {
      if (prop === symbols.original) return false;
      if (prop === tracker.property) return false;
      if (typeof prop === "symbol") return Reflect.set(target, prop, value2, receiver);
      if (tracker.associate && ctx2.reflect.props[`${tracker.associate}.${prop}`]) return Reflect.set(ctx2, `${tracker.associate}.${prop}`, value2, withProp(ctx2, symbols.receiver, receiver));
      const shadow = createShadow(ctx2, target, tracker.property, receiver);
      return Reflect.set(target, prop, value2, shadow);
    },
    apply: (target, thisArg, args) => {
      return applyTraceable(proxy, target, thisArg, args);
    }
  });
  return proxy;
}
function applyTraceable(proxy, value, thisArg, args) {
  if (!value[symbols.invoke]) return Reflect.apply(value, thisArg, args);
  return value[symbols.invoke].apply(proxy, args);
}
function createCallable(name, proto, tracker) {
  const self = function(...args) {
    return applyTraceable(createTraceable(self["ctx"], self, tracker), self, this, args);
  };
  defineProperty(self, "name", name);
  return Object.setPrototypeOf(self, proto);
}
function handleError(info, reason, getOuterStack) {
  const innerLines = info.error.stack.split("\n");
  if (typeof reason?.stack !== "string") {
    const outerError = new Error(reason);
    const lines2 = outerError.stack.split("\n");
    lines2.splice(1, Infinity, ...getOuterStack());
    outerError.stack = lines2.join("\n");
    throw outerError;
  }
  const lines = reason.stack.split("\n");
  let index = lines.indexOf(innerLines[2]);
  if (index === -1) throw reason;
  index -= info.offset;
  while (index > 0) {
    if (!lines[index - 1].endsWith(" (<anonymous>)")) break;
    index -= 1;
  }
  lines.splice(index, Infinity, ...getOuterStack());
  reason.stack = lines.join("\n");
  throw reason;
}
function composeError(callback, getOuterStack = buildOuterStack()) {
  const info = {
    offset: 1,
    error: /* @__PURE__ */ new Error()
  };
  try {
    const result = callback(info);
    if (isObject(result) && "then" in result) return result.then(void 0, (reason) => handleError(info, reason, getOuterStack));
    else return result;
  } catch (reason) {
    handleError(info, reason, getOuterStack);
  }
}
function buildOuterStack(offset = 0) {
  const outerError = /* @__PURE__ */ new Error();
  return () => outerError.stack.split("\n").slice(3 + offset);
}
function isBailed(value) {
  return value !== null && value !== false && value !== void 0;
}
var EventsService = class {
  ctx;
  _hooks = {};
  constructor(ctx2) {
    this.ctx = ctx2;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
    this.on("internal/listener", function(name, listener, options) {
      if (name === "internal/update" && !options.global) return (this.fiber._hooks["internal/update"] ??= new DisposableList())[options.prepend ? "unshift" : "push"](listener);
    });
    this.on("internal/update", function(config, noSave, next) {
      const cbs = [...this._hooks["internal/update"] || []];
      const _next = () => {
        return (cbs.shift() ?? next).call(this, config, noSave, _next);
      };
      return _next();
    }, {
      global: true,
      prepend: true
    });
  }
  /**
  * Resolve listeners for one dispatch and apply context filtering.
  *
  * @param type — the dispatch mode, reported on `internal/dispatch`.
  * @param args — the raw dispatch arguments; consumed up to the event name.
  * @returns the matching listener callbacks, bound to the dispatch `this`.
  */
  dispatch(type, args) {
    const thisArg = typeof args[0] === "object" || typeof args[0] === "function" ? args.shift() : null;
    const name = args.shift();
    if (!name.startsWith("internal/")) this.emit("internal/dispatch", type, name, args, thisArg);
    const filter = thisArg?.[Context.filter];
    return (this._hooks[name] || []).filter((hook) => hook.global || !filter || filter.call(thisArg, hook.ctx)).map((hook) => hook.callback.bind(thisArg));
  }
  /**
  * Run listeners concurrently and wait for all of them.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns a promise resolving once every listener has settled.
  */
  async parallel(...args) {
    const errors = (await Promise.allSettled(this.dispatch("emit", args).map(async (cb) => cb(...args)))).filter((result) => result.status === "rejected");
    if (errors.length) throw new AggregateError(errors.map((error) => error.reason));
  }
  /**
  * Run listeners synchronously without waiting for returned promises.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  */
  emit(...args) {
    this.dispatch("emit", args).map((cb) => cb(...args));
  }
  /**
  * Run listeners in order, awaiting each, until one returns a bail value.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns the first bail value (see {@link isBailed}), if any.
  */
  async serial(...args) {
    for (const cb of this.dispatch("serial", args)) {
      const result = await cb(...args);
      if (isBailed(result)) return result;
    }
  }
  /**
  * Run listeners synchronously until one returns a bail value.
  *
  * @param args — optional `this`, the event name, then listener arguments.
  * @returns the first bail value (see {@link isBailed}), if any.
  */
  bail(...args) {
    for (const cb of this.dispatch("bail", args)) {
      const result = cb(...args);
      if (isBailed(result)) return result;
    }
  }
  /**
  * Compose listeners around the final `next` callback.
  *
  * The last dispatch argument is treated as the innermost `next`. Listeners
  * run outermost-first; a listener that does not call `next()` vetoes the
  * rest of the chain, including the built-in behavior.
  *
  * @param args — optional `this`, the event name, listener arguments, then `next`.
  * @returns the outermost listener's return value.
  */
  waterfall(...args) {
    const cbs = this.dispatch("waterfall", args);
    const inner = args.pop();
    const next = () => {
      return (cbs.shift() ?? inner)(...args);
    };
    args.push(next);
    return next();
  }
  /**
  * Store a listener record as an effect on the current fiber.
  *
  * @param label — effect label shown in fiber diagnostics.
  * @param hooks — the listener list for one event.
  * @param callback — the listener to store.
  * @param options — placement and filtering options.
  * @returns a disposer that unregisters the listener.
  */
  register(label, hooks, callback, options) {
    const method = options.prepend ? "unshift" : "push";
    return this.ctx.fiber.effect(() => {
      hooks[method]({
        ctx: this.ctx,
        callback,
        ...options
      });
      return () => this.unregister(hooks, callback);
    }, label);
  }
  /**
  * Remove a stored listener record.
  *
  * @param hooks — the listener list for one event.
  * @param callback — the listener to remove.
  * @returns `true` if the listener was found and removed.
  */
  unregister(hooks, callback) {
    const index = hooks.findIndex((hook) => hook.callback === callback);
    if (index >= 0) {
      hooks.splice(index, 1);
      return true;
    }
  }
  /**
  * Register an event listener owned by the current fiber.
  *
  * The listener is removed automatically when the fiber unloads. Throws
  * `CordisError('INACTIVE_EFFECT')` if the fiber is already disposed.
  *
  * @param name — the event name to listen for.
  * @param listener — called with the dispatch arguments.
  * @param options — listener options; a boolean is shorthand for `prepend`.
  * @returns a disposer removing the listener; `true` if it was still registered.
  */
  on(name, listener, options) {
    if (typeof options !== "object") options = { prepend: options };
    this.ctx.fiber.assertActive();
    listener = this.ctx.reflect.bind(listener);
    const result = this.bail(this.ctx, "internal/listener", name, listener, options);
    if (result) return result;
    const hooks = this._hooks[name] ||= [];
    const label = `ctx.on(${typeof name === "string" ? JSON.stringify(name) : name.toString()})`;
    return this.register(label, hooks, listener, options);
  }
  /**
  * Register an event listener that disposes itself after the first call.
  *
  * @param name — the event name to listen for.
  * @param listener — called at most once with the dispatch arguments.
  * @param options — listener options; a boolean is shorthand for `prepend`.
  * @returns a disposer removing the listener; `true` if it was still registered.
  */
  once(name, listener, options) {
    const dispose = this.on(name, function(...args) {
      dispose();
      return listener.apply(this, args);
    }, options);
    return dispose;
  }
};
var defaultFormatters = {
  s: (value) => String(value),
  d: (value) => Math.trunc(Number(value)),
  i: (value) => Math.trunc(Number(value)),
  f: (value) => Number(value),
  o: (value) => JSON.stringify(value),
  O: (value) => JSON.stringify(value),
  c: () => "",
  C: (value, exporter, message) => {
    return Logger.color(exporter, Logger.code(message.name, exporter.colors), value);
  }
};
function isAggregateError(error) {
  return error instanceof Error && Array.isArray(error["errors"]);
}
var Logger = class {
  service;
  static color(exporter, code, value, decoration = "") {
    if (!exporter.colors) return "" + value;
    return `\x1B[3${code < 8 ? code : "8;5;" + code}${exporter.colors >= 2 ? decoration : ""}m${value}\x1B[0m`;
  }
  static code(name, level) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = (hash << 3) - hash + name.charCodeAt(i) + 13;
      hash |= 0;
    }
    const colors = !level ? [] : level >= 2 ? c256 : c16;
    return colors[Math.abs(hash) % colors.length];
  }
  static format(exporter, message) {
    const args = message.args.slice();
    if (args[0] instanceof Error) {
      args[0] = args[0].stack || args[0].message;
      args.unshift("%s");
    } else if (typeof args[0] !== "string") args.unshift("%o");
    let format = args.shift();
    format = format.replace(/%([a-zA-Z%])/g, (match, char) => {
      if (match === "%%") return "%";
      const formatter = exporter.formatters?.[char] ?? defaultFormatters[char];
      if (typeof formatter === "function") return formatter(args.shift(), exporter, message);
      return match;
    });
    const oFormatter = exporter.formatters?.o ?? defaultFormatters.o;
    for (let arg of args) {
      if (typeof arg === "object" && arg) arg = oFormatter(arg, exporter, message);
      format += " " + arg;
    }
    const { maxLength = 10240 } = exporter;
    return format.split(/\r?\n/g).map((line) => {
      return line.slice(0, maxLength) + (line.length > maxLength ? "..." : "");
    }).join("\n");
  }
  constructor(options, service) {
    this.service = service;
    Object.assign(this, options);
    this.error = this._method("error", 0);
    this.info = this._method("info", 1);
    this.warn = this._method("warn", 2);
    this.debug = this._method("debug", 3);
  }
  _method(type, level) {
    return (...args) => {
      if (args.length === 1 && args[0] instanceof Error) {
        if (args[0].cause) this[type](args[0].cause);
        else if (isAggregateError(args[0])) {
          args[0].errors.forEach((error) => this[type](error));
          return;
        }
      }
      const sn = ++this.service._snMessage;
      const ts = Date.now();
      for (const exporter of this.service.exporters.values()) {
        if ((exporter.levels?.[this.name] ?? exporter.levels?.default ?? this.level ?? 1) < level) continue;
        const message = {
          sn,
          ts,
          type,
          level,
          name: this.name,
          ...this.meta,
          args
        };
        exporter.export(message);
      }
    };
  }
};
var c16 = [
  6,
  2,
  3,
  4,
  5,
  1
];
var c256 = [
  20,
  21,
  26,
  27,
  32,
  33,
  38,
  39,
  40,
  41,
  42,
  43,
  44,
  45,
  56,
  57,
  62,
  63,
  68,
  69,
  74,
  75,
  76,
  77,
  78,
  79,
  80,
  81,
  92,
  93,
  98,
  99,
  112,
  113,
  129,
  134,
  135,
  148,
  149,
  160,
  161,
  162,
  163,
  164,
  165,
  166,
  167,
  168,
  169,
  170,
  171,
  172,
  173,
  178,
  179,
  184,
  185,
  196,
  197,
  198,
  199,
  200,
  201,
  202,
  203,
  204,
  205,
  206,
  207,
  208,
  209,
  214,
  215,
  220,
  221
];
var LoggerService = class LoggerService2 {
  bufferSize = 1e3;
  buffer = [];
  ctx;
  _snMessage = 0;
  _snExporter = 0;
  exporters = /* @__PURE__ */ new Map();
  constructor(ctx2) {
    const tracker = {
      property: "ctx",
      noShadow: true
    };
    const self = createCallable("logger", joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
    Object.assign(self, this);
    self.ctx = ctx2;
    defineProperty(self, symbols.tracker, tracker);
    self.exporter({
      colors: 3,
      export: (message) => {
        self.buffer.push(message);
        if (self.buffer.length > self.bufferSize) self.buffer = self.buffer.slice(-self.bufferSize);
      }
    });
    return self;
  }
  /**
  * Register an exporter and dispose it with the current fiber.
  *
  * @param exporter — the sink that receives structured log messages.
  * @returns a disposer that removes the exporter.
  */
  exporter(exporter) {
    return this.ctx.effect(() => {
      this.exporters.set(++this._snExporter, exporter);
      return () => this.exporters.delete(this._snExporter);
    }, "ctx.logger.exporter()");
  }
  _resolveConfig() {
    let intercept = this.ctx[symbols.intercept];
    const configs = [];
    while ("logger" in intercept) {
      if (Object.hasOwn(intercept, "logger")) configs.unshift(intercept["logger"]);
      intercept = Object.getPrototypeOf(intercept);
    }
    return Object.assign({}, ...configs);
  }
  [symbols.invoke](name) {
    const config = this._resolveConfig();
    const fiber = (this.ctx[symbols.shadow] ?? this.ctx).fiber;
    name ??= config.name;
    name ??= hyphenate(fiber.name);
    return new Logger({
      name,
      level: config.level,
      meta: { fiber: new WeakRef(fiber) }
    }, this);
  }
  static {
    for (const type of [
      "error",
      "info",
      "warn",
      "debug"
    ]) LoggerService2.prototype[type] = function(...args) {
      return this()[type](...args);
    };
  }
};
function enhanceError(error) {
  const lines = error.stack.split("\n");
  lines.splice(0, 2, `Error: ${error.message}`);
  error.stack = lines.join("\n");
  return error;
}
var RESERVED_WORDS = ["prototype", "then"];
function isSpecialProperty(prop) {
  return typeof prop === "symbol" || RESERVED_WORDS.includes(prop) || parseInt(prop).toString() === prop || prop.startsWith("_");
}
var ReflectService = class {
  ctx;
  /** Proxy traps implementing service resolution for every context object. */
  static handler = {
    get: (target, prop, ctx2) => {
      if (isSpecialProperty(prop)) return Reflect.get(target, prop, ctx2);
      if (Reflect.has(target, prop)) return getTraceable(ctx2, Reflect.get(target, prop, ctx2));
      const error = /* @__PURE__ */ new Error(`cannot get property "${prop}" without inject`);
      try {
        const def = target.reflect.props[prop];
        if (def?.type === "accessor") return def.get.call(ctx2, ctx2[symbols.receiver], error);
        if (!ctx2.fiber.runtime) return ctx2.reflect.get(prop, false);
        return ctx2.events.waterfall("internal/get", ctx2, prop, error, () => {
          const key = target[symbols.isolate][prop];
          let fiber = (ctx2[symbols.shadow] ?? ctx2).fiber;
          while (true) {
            const impl = fiber.store?.[prop];
            if (impl) return getTraceable(ctx2, impl.value);
            if (prop in fiber.inject) {
              error.message = `cannot get required service "${prop}" in inactive context`;
              throw error;
            }
            if (!fiber.runtime) throw error;
            if (fiber.parent[symbols.isolate][prop] !== key) throw error;
            fiber = fiber.parent.fiber;
          }
        });
      } catch (e) {
        throw e === error ? enhanceError(e) : e;
      }
    },
    set: (target, prop, value, ctx2) => {
      if (isSpecialProperty(prop)) return Reflect.set(target, prop, value, ctx2);
      const error = /* @__PURE__ */ new Error(`cannot set property "${prop}" without provide`);
      const def = target.reflect.props[prop];
      if (!def) {
        if (!ctx2.fiber.runtime) return Reflect.set(target, prop, value, ctx2);
        throw enhanceError(error);
      }
      try {
        if (def.type === "accessor") {
          if (!def.set) return false;
          return def.set.call(ctx2, value, ctx2[symbols.receiver], error);
        }
        return ctx2.events.waterfall("internal/set", ctx2, prop, value, error, () => {
          return ctx2.reflect.set(prop, value, error);
        });
      } catch (e) {
        throw e === error ? enhanceError(e) : e;
      }
    },
    has: (target, prop) => {
      if (isSpecialProperty(prop)) return Reflect.has(target, prop);
      if (Reflect.has(target, prop)) return true;
      return !!target.reflect.props[prop];
    }
  };
  /** Service implementations, keyed by isolation label. */
  store = /* @__PURE__ */ Object.create(null);
  /** Declared context properties (services and accessors), by name. */
  props = /* @__PURE__ */ Object.create(null);
  constructor(ctx2) {
    this.ctx = ctx2;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
    this.mixin("reflect", [
      "get",
      "set",
      "provide",
      "accessor",
      "mixin"
    ]);
    this.mixin("fiber", ["runtime", "effect"]);
    this.mixin("registry", ["inject", "plugin"]);
    this.mixin("events", [
      "on",
      "once",
      "parallel",
      "emit",
      "serial",
      "bail",
      "waterfall"
    ]);
  }
  /**
  * Read a service from the store without the inject requirement.
  *
  * @param name — the service name.
  * @param strict — when `true`, only return implementations whose providing
  * fiber is currently active.
  * @returns the service value, or `undefined` when not (yet) provided.
  */
  get(name, strict = true) {
    return getTraceable(this.ctx, this._getImpl(name, strict)?.value);
  }
  _getImpl(name, strict = true) {
    const key = this.ctx[symbols.isolate][name];
    const impl = key && this.store[key];
    if (!impl) return;
    if (strict && impl.fiber.state !== 2) return;
    return impl;
  }
  /**
  * Overwrite a provided service's value.
  *
  * @param name — the service name.
  * @param value — the new service value.
  * @param error — carrier for the caller stack in diagnostics.
  * @returns `true` on success.
  * @throws when `name` was never provided, or was provided by another fiber.
  */
  set(name, value, error) {
    const key = this.ctx[symbols.isolate][name];
    const impl = this.store[key];
    if (!impl) throw new Error(`cannot set property "${name}" without provide`);
    if (impl.fiber !== this.ctx.fiber) throw new Error(`cannot set property "${name}" in multiple fibers`);
    impl.value = value;
    return true;
  }
  /**
  * Register a service implementation owned by the current fiber.
  *
  * See the `ctx.provide()` overload above for the full contract.
  *
  * @param name — the service name.
  * @param value — the service value.
  * @param check — optional availability predicate for dependents.
  * @returns a disposer that unregisters the service.
  */
  provide(name, value, check) {
    return this.ctx.fiber.effect(() => {
      if (!this.props[name]) this.props[name] ??= { type: "service" };
      else if (this.props[name].type !== "service") throw new Error(`property "${name}" is already declared as ${this.props[name].type}`);
      this.props[name] = { type: "service" };
      this.ctx.root[symbols.isolate][name] ??= Symbol(name);
      const key = this.ctx[symbols.isolate][name];
      const impl = {
        name,
        value,
        fiber: this.ctx.fiber,
        check
      };
      if (this.store[key]) throw new Error(`service "${name}" has been registered at <${this.store[key].fiber.name}>`);
      this.store[key] = impl;
      this.ctx.fiber.store[name] = impl;
      if (this.ctx.fiber.state === 2) this.notify([name]);
      return async () => {
        delete this.store[key];
        const fibers = this.notify([name]);
        await Promise.allSettled(fibers.map((fiber) => fiber.await()));
        delete this.ctx.fiber.store[name];
      };
    }, `ctx.provide(${JSON.stringify(name)})`);
  }
  /**
  * Re-evaluate every fiber that requires one of the given services.
  *
  * @param names — the service names that changed.
  * @param filter — restricts notification to matching isolation scopes.
  * @returns the fibers whose dependency state was refreshed.
  */
  notify(names, filter = (ctx2, name) => ctx2[symbols.isolate][name] === this.ctx[symbols.isolate][name]) {
    const fibers = [];
    for (const runtime of this.ctx.registry.values()) for (const fiber of runtime.fibers) {
      let hasUpdate = false;
      for (const name of names) {
        if (!(name in fiber.inject)) continue;
        if (!filter(fiber.ctx, name)) continue;
        hasUpdate = true;
        fiber._checkImpl(name);
      }
      if (!hasUpdate) continue;
      fiber._refresh();
      fibers.push(fiber);
    }
    for (const name of names) {
      const self = Object.create(this.ctx);
      self[symbols.filter] = (target) => filter(target, name);
      this.ctx.events.emit(self, "internal/service", name, this._getImpl(name, false)?.value);
    }
    return fibers;
  }
  /**
  * Define a computed context property backed by get/set hooks.
  *
  * @param name — the context property name.
  * @param options — the `get` hook and optional `set` hook.
  * @returns a disposer that removes the accessor.
  */
  accessor(name, options) {
    return this.ctx.fiber.effect(() => {
      if (name in this.props) throw new Error(`property "${name}" is already declared as ${this.props[name].type}`);
      this.props[name] = {
        type: "accessor",
        ...options
      };
      return () => delete this.props[name];
    }, `ctx.accessor(${JSON.stringify(name)})`);
  }
  /**
  * Expose selected members of a service directly on `ctx`.
  *
  * See the `ctx.mixin()` overload above for the full contract.
  *
  * @param source — a context property name or a source object.
  * @param mixins — keys to forward, or a source-key → ctx-key map.
  * @returns a disposer that removes all created accessors.
  */
  mixin(source, mixins) {
    const self = this;
    return this.ctx.fiber.effect(function* () {
      const entries = Array.isArray(mixins) ? mixins.map((key) => [key, key]) : Object.entries(mixins);
      const getTarget = (ctx2, error) => {
        return ctx2[source];
      };
      for (const [key, value] of entries) yield self.accessor(value, {
        get(receiver, error) {
          const service = getTarget(this, error);
          if (isNullable(service)) return service;
          const mixin = receiver ? withProps(receiver, service) : service;
          const value2 = Reflect.get(service, key, mixin);
          if (typeof value2 !== "function") return value2;
          return value2.bind(mixin ?? service);
        },
        set(value2, receiver, error) {
          const service = getTarget(this, error);
          const mixin = receiver ? withProps(receiver, service) : service;
          return Reflect.set(service, key, value2, mixin);
        }
      });
    }, `ctx.mixin(${JSON.stringify(source)})`);
  }
  /**
  * Attach this context's tracing wrapper to a value.
  *
  * @param value — the value to wrap.
  * @returns the traceable wrapper (or the value itself when not applicable).
  */
  trace(value) {
    return getTraceable(this.ctx, value);
  }
  /**
  * Wrap a callback so calls trace `this` and arguments to this context.
  *
  * @param callback — the function to wrap.
  * @returns a proxy delegating to `callback` with traced values.
  */
  bind(callback) {
    return new Proxy(callback, {
      apply: (target, thisArg, args) => {
        return Reflect.apply(target, this.trace(thisArg), args.map((arg) => this.trace(arg)));
      },
      construct: (target, args, newTarget) => {
        return Reflect.construct(target, args.map((arg) => this.trace(arg)), newTarget);
      }
    });
  }
};
var kValidationError = /* @__PURE__ */ Symbol.for("ValidationError");
var ValidationError = class extends TypeError {
  name = "ValidationError";
  /**
  * Build the aggregated message from schema issues.
  *
  * @param issues — the standard-schema issues, one message line each.
  */
  constructor(issues) {
    super(`invalid config:
` + issues.map((issue) => {
      if (issue.path) return `  - ${issue.message} (at ${issue.path.join(".")})`;
      else return `  - ${issue.message}`;
    }).join("\n"));
  }
};
Object.defineProperty(ValidationError.prototype, kValidationError, { value: true });
function resolveConfig(runtime, config) {
  if (!runtime.Config) return config;
  const result = runtime.Config["~standard"].validate(config);
  if ("then" in result) throw new TypeError("Async config validation is not supported");
  if (result.issues) throw new ValidationError(result.issues);
  else return result.value;
}
var effectInertia = /* @__PURE__ */ new WeakMap();
function runDisposable(dispose) {
  const result = dispose();
  return effectInertia.get(dispose)?.() ?? result;
}
function emitPluginDisposed(context, fiber) {
  const args = ["internal/plugin", fiber];
  let callbacks;
  try {
    callbacks = context.events.dispatch("emit", args);
  } catch (error) {
    context.logger.error(error);
    return;
  }
  for (const callback of callbacks) try {
    const returned = callback(...args);
    Promise.resolve(returned).catch((error) => context.logger.error(error));
  } catch (error) {
    context.logger.error(error);
  }
}
var CordisError = class CordisError2 extends Error {
  code;
  /**
  * @param code — the stable error code; also the default message.
  * @param message — optional human-readable override.
  */
  constructor(code, message) {
    super(message ?? CordisError2.Code[code]);
    this.code = code;
  }
};
(function(CordisError3) {
  CordisError3.Code = { INACTIVE_EFFECT: "cannot create effect on inactive context" };
})(CordisError || (CordisError = {}));
var INACTIVE = "__INACTIVE__";
var Fiber = class {
  parent;
  inject;
  runtime;
  /** Unique id within the registry; 0 for the root fiber, `null` once disposed. */
  uid;
  /** The context this fiber's plugin runs in (extends the parent context). */
  ctx;
  /** The validated plugin config (updated by `update()`). */
  config;
  /** The raw plugin config, re-resolved before each activation. */
  _config;
  /** Current lifecycle state; transitions emit `internal/status`. */
  state = 0;
  /** Dispose this fiber: unload the plugin, then settle once cleanup finished. */
  dispose;
  /** Snapshot of required service implementations while loaded; `undefined` otherwise. */
  store;
  /** The in-flight load/unload transition, if one is currently running. */
  inertia;
  _hooks = /* @__PURE__ */ Object.create(null);
  _disposables = new DisposableList();
  context;
  _error;
  _runner;
  _store = /* @__PURE__ */ Object.create(null);
  /**
  * Create a fiber. Plugin authors normally obtain fibers from `ctx.plugin()`
  * rather than constructing them directly.
  *
  * @param parent — the context the plugin was loaded from.
  * @param config — raw config, validated against the runtime's schema.
  * @param inject — resolved dependency map (service name → intercept config).
  * @param runtime — the shared plugin runtime, or `null` for the root fiber.
  * @param getOuterStack — captures the caller stack for effect diagnostics.
  */
  constructor(parent, config, inject, runtime, getOuterStack) {
    this.parent = parent;
    this.inject = inject;
    this.runtime = runtime;
    this._config = config;
    const collect = (dispose) => {
      this._disposables.push(dispose);
    };
    if (runtime) {
      this.uid = parent.registry.counter;
      this.ctx = this.context = parent.extend({ fiber: this });
      const injectEntries = Object.entries(this.inject);
      if (injectEntries.length) {
        this.ctx[Context.intercept] = Object.create(parent[Context.intercept]);
        for (const [name, config2] of injectEntries) {
          if (isNullable(config2)) continue;
          this.ctx[Context.intercept][name] = config2;
        }
      }
      this._runner = {
        epoch: INACTIVE,
        getOuterStack,
        execute: function() {
          if (isConstructor(runtime.callback)) {
            const instance = new runtime.callback(this.ctx, this.config);
            for (const hook of instance?.[symbols.initHooks] ?? []) hook();
            return instance?.[symbols.init]?.();
          } else return runtime.callback(this.ctx, this.config);
        },
        collect
      };
      this.dispose = parent.fiber.effect(() => {
        const remove = runtime.fibers.push(this);
        return async () => {
          this.uid = null;
          emitPluginDisposed(this.context, this);
          if (this.ctx.registry.has(runtime.callback)) {
            remove();
            if (!runtime.fibers.length) this.ctx.registry.delete(runtime.callback);
          }
          this._setEpoch(INACTIVE);
          if (!this.inertia) this._updateState(() => {
            this.inertia = this._unload();
            return 5;
          });
          while (this.inertia) await this.inertia;
        };
      }, "ctx.plugin()");
      try {
        this.context.emit("internal/plugin", this);
      } catch (error) {
        Promise.resolve(this.dispose()).catch((reason) => this.ctx.logger.error(reason));
        throw error;
      }
      if (this.uid !== null && parent.fiber.state !== 5) {
        for (const name of Object.keys(this.inject)) this._checkImpl(name);
        this._refresh();
      }
    } else {
      this.uid = 0;
      this.ctx = this.context = parent;
      this.state = 2;
      this.store = /* @__PURE__ */ Object.create(null);
      this._runner = {
        epoch: "",
        getOuterStack,
        execute: () => {
        },
        collect
      };
      this.dispose = () => this.restart();
    }
  }
  /** The plugin's display name, inherited from the nearest named ancestor, else `'root'`. */
  get name() {
    let fiber = this;
    do {
      if (fiber.runtime?.name) return fiber.runtime.name;
      fiber = fiber.parent.fiber;
    } while (fiber !== fiber.parent.fiber);
    return "root";
  }
  /**
  * Throw if the fiber has already been disposed.
  *
  * @returns nothing when the fiber is still active.
  * @throws {CordisError} `INACTIVE_EFFECT` when the fiber's uid has been cleared.
  */
  assertActive() {
    if (this.uid !== null) return;
    throw new CordisError("INACTIVE_EFFECT");
  }
  _execute(runner) {
    const oldEpoch = runner.epoch;
    return composeError((info) => {
      const safeCollect = (dispose) => {
        if (typeof dispose === "function") runner.collect(dispose);
        else if (!isNullable(dispose)) throw new TypeError("Invalid effect");
      };
      const effect = runner.execute.call(this);
      if (typeof effect === "function") return runner.collect(effect);
      else if (isNullable(effect)) {
      } else if (!isObject(effect)) throw new TypeError("Invalid effect");
      else if ("then" in effect) return effect.then(safeCollect);
      else if (Symbol.iterator in effect) {
        info.error = /* @__PURE__ */ new Error();
        const iter = effect[Symbol.iterator]();
        while (true) {
          const result = iter.next();
          safeCollect(result.value);
          if (result.done) return;
        }
      } else if (Symbol.asyncIterator in effect) {
        const iter = effect[Symbol.asyncIterator]();
        return (async () => {
          await Promise.resolve();
          info.error = /* @__PURE__ */ new Error();
          while (true) {
            if (runner.epoch !== oldEpoch) return;
            const result = await iter.next();
            safeCollect(result.value);
            if (result.done) return;
          }
        })();
      } else throw new TypeError("Invalid effect");
    }, runner.getOuterStack);
  }
  effect(execute, label = "anonymous") {
    this.assertActive();
    if (this.state === 5) throw new CordisError("INACTIVE_EFFECT");
    const disposables = [];
    let disposing = false;
    let disposalTask;
    const dispose = () => {
      if (disposing) return disposalTask;
      disposing = true;
      let task2;
      for (const disposable of disposables.splice(0).reverse()) if (task2) task2 = task2.then(() => runDisposable(disposable));
      else {
        const result = runDisposable(disposable);
        if (isObject(result) && "then" in result) task2 = result;
      }
      return disposalTask = task2;
    };
    const meta = {
      label,
      children: []
    };
    const runner = {
      execute,
      epoch: true,
      collect: (dispose2) => {
        disposables.push(dispose2);
        this._disposables.delete(dispose2);
        if (dispose2[symbols.effect]) meta.children.push(dispose2[symbols.effect]);
      },
      getOuterStack: buildOuterStack()
    };
    let task;
    let executing = true;
    let resolveSetup;
    let rejectSetup;
    let setupBarrier;
    let setupFailed = false;
    let inFlight;
    let removeWrapper = () => false;
    const waitForSetup = () => {
      setupBarrier ??= new Promise((resolve2, reject) => {
        resolveSetup = resolve2;
        rejectSetup = reject;
      });
      return setupBarrier;
    };
    const disposeAfter = (setup) => {
      return Promise.resolve(setup).then(() => dispose(), async (reason) => {
        await dispose();
        throw reason;
      });
    };
    const finalizeDisposal = (callback) => {
      let result;
      try {
        result = callback();
      } catch (error) {
        removeWrapper();
        throw error;
      }
      if (isObject(result) && "then" in result) {
        const pending = Promise.resolve(result).finally(() => {
          removeWrapper();
          if (inFlight === pending) inFlight = void 0;
        });
        return inFlight = pending;
      }
      removeWrapper();
      return result;
    };
    const wrapper = defineProperty(() => {
      if (!runner.epoch) return setupFailed ? inFlight : void 0;
      runner.epoch = false;
      return finalizeDisposal(() => {
        if (executing) return disposeAfter(waitForSetup());
        return task ? disposeAfter(task) : dispose();
      });
    }, symbols.effect, meta);
    effectInertia.set(wrapper, () => inFlight);
    removeWrapper = this._disposables.push(wrapper);
    try {
      task = this._execute(runner);
    } catch (reason) {
      executing = false;
      setupFailed = true;
      runner.epoch = false;
      let cleanup;
      try {
        cleanup = finalizeDisposal(dispose);
      } finally {
        rejectSetup?.(reason);
      }
      if (isObject(cleanup) && "then" in cleanup) cleanup.catch((error) => this.ctx.logger.error(error));
      throw reason;
    }
    executing = false;
    if (setupBarrier) Promise.resolve(task).then(resolveSetup, rejectSetup);
    task?.catch(() => {
      if (!runner.epoch) return dispose();
      return finalizeDisposal(dispose);
    }).catch((error) => this.ctx.logger.error(error));
    const disposeAsync = () => {
      if (!runner.epoch) return;
      runner.epoch = false;
      return finalizeDisposal(dispose);
    };
    wrapper.then = async (onFulfilled, onRejected) => {
      return Promise.resolve(task).then(() => disposeAsync).then(onFulfilled, onRejected);
    };
    return wrapper;
  }
  /**
  * Return metadata for currently registered effects.
  *
  * @returns one {@link EffectMeta} tree per labeled live effect.
  */
  getEffects() {
    return [...this._disposables].map((dispose) => dispose[symbols.effect]).filter(Boolean);
  }
  _getState() {
    if (this.uid === null) return 4;
    if (this._error) return 3;
    if (this._runner.epoch !== INACTIVE) return 2;
    return 0;
  }
  _updateState(callback) {
    const oldState = this.state;
    this.state = callback() ?? this._getState();
    if (oldState === this.state) return;
    this.context.emit("internal/status", this, oldState);
    if (oldState !== 2 && this.state !== 2) return;
    for (const key of Reflect.ownKeys(this.ctx.reflect.store)) {
      const impl = this.ctx.reflect.store[key];
      if (impl.fiber !== this) continue;
      this.ctx.reflect.notify([impl.name]);
    }
  }
  _checkImpl(name) {
    const impl = this.ctx.reflect._getImpl(name, true);
    if (!impl) return delete this._store[name];
    try {
      if (impl.check && !impl.check.call(getTraceable(this.ctx, impl.value))) return delete this._store[name];
    } catch (error) {
      impl.fiber.ctx.logger.error(error);
      return delete this._store[name];
    }
    this._store[name] = impl;
  }
  _refresh() {
    let epoch = false;
    epoch = "";
    for (const name of Object.keys(this.inject)) {
      const impl = this._store[name];
      if (!impl) {
        epoch = INACTIVE;
        break;
      }
      epoch += ":" + impl.fiber.uid;
    }
    this._setEpoch(epoch);
  }
  _setEpoch(epoch) {
    const oldEpoch = this._runner.epoch;
    if (epoch === oldEpoch) return;
    this._runner.epoch = epoch;
    if (this.inertia) return;
    this._updateState(() => {
      if (epoch !== INACTIVE && oldEpoch === INACTIVE) {
        this.inertia = this._reload();
        return 1;
      } else {
        this.inertia = this._unload();
        return 5;
      }
    });
  }
  _resolveConfig(config) {
    config = this.context.waterfall(this, "internal/config", config, () => config);
    return this.runtime ? resolveConfig(this.runtime, config) : config;
  }
  async _reload() {
    this.store = { ...this._store };
    const oldEpoch = this._runner.epoch;
    try {
      await Promise.resolve();
      if (this._runner.epoch === oldEpoch) {
        this.config = this._resolveConfig(this._config);
        await this._execute(this._runner);
        this._error = void 0;
      }
    } catch (reason) {
      this.ctx.logger.error(reason);
      this._error = reason;
      this._runner.epoch = INACTIVE;
    }
    this._updateState(() => {
      if (this._runner.epoch === oldEpoch) this.inertia = void 0;
      else {
        this.inertia = this._unload();
        return 5;
      }
    });
  }
  async _unload() {
    await Promise.all(this._disposables.clear().map(async (dispose) => {
      try {
        await composeError(async (info) => {
          await Promise.resolve();
          info.error = /* @__PURE__ */ new Error();
          await runDisposable(dispose);
        }, this._runner.getOuterStack);
      } catch (reason) {
        this.ctx.logger.error(reason);
      }
    }));
    this.store = void 0;
    this._updateState(() => {
      if (this._runner.epoch === INACTIVE) this.inertia = void 0;
      else {
        this.inertia = this._reload();
        return 1;
      }
    });
  }
  /**
  * Wait for current lifecycle work and rethrow startup errors.
  *
  * @returns this fiber, once it has settled into a stable state.
  * @throws the config-validation or plugin-startup error, if any.
  */
  async await() {
    while (this.inertia) await this.inertia;
    if (this._error) throw this._error;
    return this;
  }
  /**
  * Dispose and immediately reload this plugin with its current config.
  *
  * @returns a promise resolving once the reload settled.
  * @throws {CordisError} `INACTIVE_EFFECT` when the fiber is already disposed.
  */
  async restart() {
    this.assertActive();
    this._setEpoch(INACTIVE);
    this._refresh();
    await this.await();
  }
  /**
  * Validate and apply new config, then restart the plugin.
  *
  * Runs the `internal/update` waterfall first, so update hooks (and HMR)
  * can veto or replace the restart.
  *
  * @param config — the new raw config; validated before anything restarts.
  * @param noSave — hint for persistence hooks not to write the change back.
  * @returns the update waterfall result; the default restart returns a promise.
  * @throws when validation, an update listener, or the restarted plugin fails.
  */
  update(config, noSave = false) {
    this.assertActive();
    this._config = config;
    if (this.state !== 2) {
      this._error = void 0;
      this._setEpoch(INACTIVE);
      this._refresh();
      return;
    }
    config = this._resolveConfig(config);
    return this.context.waterfall(this, "internal/update", config, noSave, () => {
      this.config = config;
      this._error = void 0;
      return this.restart();
    });
  }
};
function isApplicable(object) {
  return object && typeof object === "object" && typeof object.apply === "function";
}
function Inject(name, config) {
  return function(value, decorator) {
    if (decorator.kind === "class") {
      if (!Object.hasOwn(value, "inject")) {
        defineProperty(value, "inject", Object.create(Object.getPrototypeOf(value).inject ?? null));
        defineProperty(value.inject, symbols.checkProto, true);
      }
      value.inject[name] = config;
    } else if (decorator.kind === "method") {
      const inject = (value[symbols.metadata] ??= {}).inject ??= /* @__PURE__ */ Object.create(null);
      inject[name] = config;
      decorator.addInitializer(function() {
        const property2 = this[symbols.tracker]?.property;
        (this[symbols.initHooks] ??= []).push(() => {
          this.ctx.inject(inject, (ctx2) => {
            return value.call(property2 ? withProps(this, { [property2]: ctx2 }) : this);
          });
        });
      });
    } else throw new Error("@Inject() can only be used on class or class methods");
  };
}
(function(Inject2) {
  function resolve2(inject, result = /* @__PURE__ */ Object.create(null)) {
    if (!inject) return result;
    if (Array.isArray(inject)) for (const name of inject) result[name] = null;
    else if (Reflect.has(inject, symbols.checkProto)) {
      Object.assign(result, resolve2(Object.getPrototypeOf(inject)));
      for (const name of Object.keys(inject)) result[name] = inject[name] ?? null;
    } else for (const name of Object.keys(inject)) result[name] = inject[name] ?? null;
    return result;
  }
  Inject2.resolve = resolve2;
})(Inject || (Inject = {}));
var RegistryService = class {
  ctx;
  _counter = 0;
  _internal = /* @__PURE__ */ new Map();
  constructor(ctx2) {
    this.ctx = ctx2;
    defineProperty(this, symbols.tracker, {
      property: "ctx",
      noShadow: true
    });
  }
  /** Allocate the next fiber uid (increments on every read). */
  get counter() {
    return ++this._counter;
  }
  /** Number of registered plugin runtimes. */
  get size() {
    return this._internal.size;
  }
  /**
  * Resolve a supported plugin shape to its executable callback.
  *
  * @param plugin — a function, class, or `{ apply }` object plugin.
  * @returns the callback identifying the plugin, or `undefined` if invalid.
  */
  resolve(plugin) {
    try {
      if (typeof plugin === "function") return plugin;
      if (isApplicable(plugin)) return plugin.apply;
    } catch {
    }
  }
  /**
  * Look up the runtime record for a plugin.
  *
  * @param plugin — any supported plugin shape.
  * @returns the runtime, or `undefined` when the plugin is not registered.
  */
  get(plugin) {
    const key = this.resolve(plugin);
    return key && this._internal.get(key);
  }
  /**
  * Check whether a plugin has a registered runtime.
  *
  * @param plugin — any supported plugin shape.
  * @returns `true` when at least one fiber of the plugin exists.
  */
  has(plugin) {
    const key = this.resolve(plugin);
    return !!key && this._internal.has(key);
  }
  /**
  * Dispose every running fiber for a plugin and remove its runtime record.
  *
  * @param plugin — any supported plugin shape.
  * @returns the removed runtime, or `undefined` when none was registered.
  */
  delete(plugin) {
    const key = this.resolve(plugin);
    const runtime = key && this._internal.get(key);
    if (!runtime) return;
    this._internal.delete(key);
    for (const fiber of runtime.fibers) fiber.dispose();
    return runtime;
  }
  /** Iterate the registered plugin callbacks. */
  keys() {
    return this._internal.keys();
  }
  /** Iterate the registered plugin runtimes. */
  values() {
    return this._internal.values();
  }
  /** Iterate `[callback, runtime]` pairs. */
  entries() {
    return this._internal.entries();
  }
  /**
  * Visit every registered runtime.
  *
  * @param callback — receives each runtime and its identifying callback.
  */
  forEach(callback) {
    return this._internal.forEach(callback);
  }
  /**
  * Start a callback once the requested dependencies are available.
  *
  * @param inject — required services, as an array or a name → config map.
  * @param callback — plugin body called with `(ctx, config)`.
  * @returns the fiber; awaiting it settles once loading finished.
  */
  inject(inject, callback) {
    return this.plugin({
      inject,
      apply: callback,
      name: callback.name
    });
  }
  /**
  * Start a plugin in the current context and return its fiber.
  *
  * Creates (or reuses) the plugin's runtime record, then starts a new fiber
  * under the current context. Throws if `plugin` is not a supported shape or
  * if the current fiber is already disposed.
  *
  * @param plugin — a function, class, or `{ apply }` object plugin.
  * @param config — the plugin config, validated against its `Config` schema.
  * @param getOuterStack — captures the caller stack for effect diagnostics.
  * @returns the fiber; awaiting it settles once loading finished.
  */
  plugin(plugin, config, getOuterStack = buildOuterStack()) {
    const callback = this.resolve(plugin);
    if (!callback) throw new Error('invalid plugin, expect function or object with an "apply" method, received ' + typeof plugin);
    this.ctx.fiber.assertActive();
    let runtime = this._internal.get(callback);
    if (!runtime) {
      let name = plugin.name;
      if (name === "apply") name = void 0;
      runtime = {
        name,
        callback,
        fibers: new DisposableList(),
        Config: plugin.Config
      };
      this._internal.set(callback, runtime);
    }
    const fiber = new Fiber(this.ctx, config, Inject.resolve(plugin.inject), runtime, getOuterStack);
    const wrapped = Object.create(fiber);
    wrapped.then = (onFulfilled, onRejected) => {
      return fiber.await().then(onFulfilled, onRejected);
    };
    return wrapped;
  }
};
var Context = class Context2 {
  /** Symbol key under which a disposer exposes its {@link EffectMeta} diagnostics tree. */
  static effect = symbols.effect;
  /** Symbol key for a context's listener filter, consulted on every event dispatch. */
  static filter = symbols.filter;
  /** Symbol key of the isolation map (see the `Context[symbols.isolate]` property). */
  static isolate = symbols.isolate;
  /** Symbol key of the intercept map (see the `Context[symbols.intercept]` property). */
  static intercept = symbols.intercept;
  /**
  * Returns true for Cordis context proxies and context prototypes.
  *
  * Works across realms and across multiple copies of cordis, because the
  * brand is keyed by a global symbol rather than by `instanceof`.
  *
  * @param value — the value to test.
  * @returns `true` if `value` is a Cordis context, narrowing its type.
  */
  static is(value) {
    return !!value?.[Context2.is];
  }
  static {
    Context2.is[Symbol.toPrimitive] = () => /* @__PURE__ */ Symbol.for("cordis.is");
    Context2.prototype[Context2.is] = true;
  }
  /** Create the root context and install the built-in services. */
  constructor() {
    this[symbols.isolate] = /* @__PURE__ */ Object.create(null);
    this[symbols.intercept] = /* @__PURE__ */ Object.create(null);
    const self = new Proxy(this, ReflectService.handler);
    this.root = self;
    this.baseUrl = void 0;
    this.fiber = new Fiber(self, {}, /* @__PURE__ */ Object.create(null), null, () => []);
    this.reflect = new ReflectService(self);
    this.registry = new RegistryService(self);
    this.events = new EventsService(self);
    this.logger = new LoggerService(self);
    this.fiber._disposables.clear();
    return self;
  }
  [/* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom")]() {
    return `Context <${this.fiber.name}>`;
  }
  /**
  * Create a child context with extra metadata on top of the current scope.
  *
  * The child prototypally inherits every property of this context; own
  * properties of `meta` shadow the inherited ones. The parent is not mutated.
  *
  * @param meta — own properties (including symbol keys) to define on the child.
  * @returns a child context inheriting from this one.
  */
  extend(meta = {}) {
    const shadow = Reflect.getOwnPropertyDescriptor(this, symbols.shadow)?.value;
    const self = Object.create(getTraceable(this, this));
    for (const prop of Reflect.ownKeys(meta)) Object.defineProperty(self, prop, Reflect.getOwnPropertyDescriptor(meta, prop));
    if (!shadow) return self;
    return Object.assign(Object.create(self), { [symbols.shadow]: shadow });
  }
  /**
  * Create a child context with an independent service scope for `name`.
  *
  * Below the returned context, reads and writes of the service `name`
  * resolve against the new label instead of the parent's, so a different
  * implementation can be provided without affecting the parent scope.
  * Passing the same `label` to two `isolate()` calls joins their scopes.
  *
  * @param name — the service name to isolate.
  * @param label — scope label to join; defaults to a fresh unique symbol.
  * @returns a child context whose `name` service resolves in the new scope.
  */
  isolate(name, label) {
    const shadow = Object.create(this[symbols.isolate]);
    shadow[name] = label ?? Symbol(name);
    return this.extend({ [symbols.isolate]: shadow });
  }
  intercept(name, config) {
    const intercept = Object.create(this[symbols.intercept]);
    intercept[name] = config;
    return this.extend({ [symbols.intercept]: intercept });
  }
};
var Service = class Service2 {
  ctx;
  /** Symbol key of an instance method run after construction (class plugins). */
  static init = symbols.init;
  /** Symbol key of the availability predicate passed to `ctx.provide()`. */
  static check = symbols.check;
  /** Symbol key of the phantom intercept-config type parameter. */
  static config = symbols.config;
  /** Symbol key of the call body making a service callable (e.g. `ctx.logger()`). */
  static invoke = symbols.invoke;
  /** Symbol key of the helper deriving an extended service instance. */
  static extend = symbols.extend;
  /** Symbol key of the tracker metadata used for context tracing. */
  static tracker = symbols.tracker;
  /** Symbol key of the intercept-config resolution helper below. */
  static resolveConfig = symbols.resolveConfig;
  /** The service name this instance is registered under. */
  name;
  /**
  * Register this instance as `name` in the current context.
  *
  * Calls `ctx.reflect.provide(name, this, this[Service.check])`, so the
  * service is unregistered automatically when the owning fiber unloads.
  * Services with a `[Service.invoke]` body return a callable instance.
  *
  * @param ctx — the context to register in (stored as `this.ctx`).
  * @param name — the service name; defaults to the static `provide` field.
  */
  constructor(ctx2, name) {
    this.ctx = ctx2;
    name ??= this.constructor["provide"];
    let self = this;
    const tracker = {
      associate: name,
      property: "ctx"
    };
    if (self[symbols.invoke]) self = createCallable(name, joinPrototype(Object.getPrototypeOf(this), Function.prototype), tracker);
    self.ctx = ctx2;
    self.name = name;
    defineProperty(self, symbols.tracker, tracker);
    self.ctx.reflect.provide(name, self, this[symbols.check]);
    return self;
  }
  [symbols.filter](ctx2) {
    return ctx2[symbols.isolate][this.name] === this.ctx[symbols.isolate][this.name];
  }
  [symbols.extend](props) {
    let self;
    if (this[Service2.invoke]) self = createCallable(this.name, this, this[symbols.tracker]);
    else self = Object.create(this);
    return Object.assign(self, props);
  }
  /**
  * Merge intercept config from ancestors with optional base and head values.
  *
  * Entries added closer to the root apply first; `base` is prepended and
  * `head` appended. Uses `Config.merge` when the service declares one,
  * otherwise a shallow `Object.assign`.
  *
  * @param base — lowest-precedence config merged before all intercepts.
  * @param head — highest-precedence config merged after all intercepts.
  * @returns the merged config.
  */
  [symbols.resolveConfig](base, head) {
    let intercept = this.ctx[Context.intercept];
    const configs = [];
    while (this.name in intercept) {
      if (Object.hasOwn(intercept, this.name)) configs.unshift(intercept[this.name]);
      intercept = Object.getPrototypeOf(intercept);
    }
    if (base) configs.unshift(base);
    if (head) configs.push(head);
    if (this["Config"]?.merge) return this["Config"].merge(...configs);
    else return Object.assign({}, ...configs);
  }
  static [Symbol.hasInstance](instance) {
    if (!instance) return false;
    let constructor = instance.constructor;
    while (constructor) {
      constructor = constructor.prototype?.constructor;
      if (constructor === this) return true;
      constructor &&= Object.getPrototypeOf(constructor);
    }
    return false;
  }
};

// echoflowai-tools/node_modules/@deepseek-ai/dsh-settings/lib/index.js
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function walk(node, value, path, secrets) {
  if (node === void 0) return value;
  if (node.meta?.role === "secret") {
    secrets.push({
      path,
      set: value !== void 0
    });
    return;
  }
  switch (node.type) {
    case "object": {
      const properties = node.dict ?? {};
      const source = isRecord(value) ? value : void 0;
      const rebuilt = {};
      if (source !== void 0) for (const [key, entry] of Object.entries(source)) {
        if (key in properties) continue;
        rebuilt[key] = entry;
      }
      for (const [key, child] of Object.entries(properties)) {
        const stripped = walk(child, source?.[key], [...path, key], secrets);
        if (stripped !== void 0) rebuilt[key] = stripped;
      }
      return source === void 0 && Object.keys(rebuilt).length === 0 ? value : rebuilt;
    }
    case "dict": {
      if (!isRecord(value)) return value;
      const rebuilt = {};
      for (const [key, entry] of Object.entries(value)) {
        const stripped = walk(node.inner, entry, [...path, key], secrets);
        if (stripped !== void 0) rebuilt[key] = stripped;
      }
      return rebuilt;
    }
    case "array":
      if (!Array.isArray(value)) return value;
      return value.map((entry, index) => walk(node.inner, entry, [...path, String(index)], secrets));
    default:
      return value;
  }
}
function redactSecrets(schema, value) {
  const secrets = [];
  return {
    value: walk(schema, value, [], secrets),
    secrets
  };
}
var NAMESPACE_PATTERN = /^[a-z][a-z0-9-]*$/;
function settingsNamespace(value) {
  if (!NAMESPACE_PATTERN.test(value)) throw new TypeError(`settings namespace "${value}" must match ${String(NAMESPACE_PATTERN)}`);
  return value;
}
function deepEqualJson(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((entry, index) => deepEqualJson(entry, b[index]));
  }
  const left = a;
  const right = b;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => key in right && deepEqualJson(left[key], right[key]));
}
var SettingsConflictError = class extends Error {
  /** Stable machine code for wire layers mapping this to their own taxonomy. */
  code = "SETTINGS_CONFLICT";
  /** The revision the write expected. */
  expected;
  /** The revision the namespace actually stands at. */
  actual;
  /**
  * @param ns - the namespace whose write was refused.
  * @param expected - the revision the caller sent.
  * @param actual - the revision now stored.
  */
  constructor(ns, expected, actual) {
    super(`settings namespace "${ns}" changed since it was read (expected revision ${String(expected)}, now ${String(actual)})`);
    this.name = "SettingsConflictError";
    this.expected = expected;
    this.actual = actual;
  }
};
function isPlainObject2(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
function applyPathOp(section, op) {
  const [head, ...rest] = op.path;
  if (head === void 0) {
    if (op.op === "unset") return {};
    if (!isPlainObject2(op.value)) throw new TypeError("settings mutate: setting the section root requires a plain object");
    return { ...op.value };
  }
  if (rest.length === 0) {
    if (op.op === "set") return {
      ...section,
      [head]: op.value
    };
    const { [head]: _removed, ...kept } = section;
    return kept;
  }
  const child = section[head];
  if (!isPlainObject2(child)) {
    if (op.op === "unset") return section;
    return {
      ...section,
      [head]: applyPathOp({}, {
        ...op,
        path: rest
      })
    };
  }
  return {
    ...section,
    [head]: applyPathOp(child, {
      ...op,
      path: rest
    })
  };
}
function describeRejected(value) {
  if (value === void 0) return "undefined";
  if (typeof value === "object" && value !== null) {
    const name = Object.getPrototypeOf(value)?.constructor?.name;
    return name === void 0 || name === "Object" ? "a non-plain object" : `a ${name}`;
  }
  return `a ${typeof value}`;
}
function cloneJsonShaped(root, reject) {
  const visiting = /* @__PURE__ */ new WeakSet();
  const clone2 = (value, path) => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw reject("a non-finite number", path);
      return value;
    }
    if (Array.isArray(value)) {
      if (visiting.has(value)) throw reject("a circular reference", path);
      visiting.add(value);
      const entries = value.map((entry, index) => clone2(entry, `${path}[${index}]`));
      visiting.delete(value);
      return entries;
    }
    if (isPlainObject2(value)) {
      if (visiting.has(value)) throw reject("a circular reference", path);
      visiting.add(value);
      const out = {};
      for (const [key, entry] of Object.entries(value)) {
        if (entry === void 0) continue;
        out[key] = clone2(entry, `${path}.${key}`);
      }
      visiting.delete(value);
      return out;
    }
    throw reject(describeRejected(value), path);
  };
  return clone2(root, "$");
}
function mergeLayers(under, over) {
  if (over === void 0) return under;
  if (!isPlainObject2(under) || !isPlainObject2(over)) return over;
  const merged = { ...under };
  for (const [key, value] of Object.entries(over)) merged[key] = key in merged ? mergeLayers(merged[key], value) : value;
  return merged;
}
function deepFreeze(value) {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}
var SettingsProvider = class extends Service {
  registrations = /* @__PURE__ */ new Map();
  /** Latest published raw document; empty until the provider's first publish. */
  document = {};
  /** Per-namespace write chains; settled tails, so a failure never poisons the queue. */
  writeQueues = /* @__PURE__ */ new Map();
  /** In-flight watcher invocation segments, drained by the dispose teardown. */
  pendingTails = /* @__PURE__ */ new Set();
  /** Set at service dispose: refuse new writes while queued ones drain. */
  stopped = false;
  /** Opaque read of {@link stopped}: control flow cannot narrow it across awaits. */
  isStopped() {
    return this.stopped;
  }
  constructor(ctx2) {
    super(ctx2, "settings");
  }
  /**
  * Load the provider's document once and publish it before the service
  * becomes injectable, and register the write-drain teardown. Providers with
  * their own init (watchers, connections) delegate here first via
  * `yield* super[Service.init]()`; their disposers then run before the drain.
  */
  async *[Service.init]() {
    yield async () => {
      this.stopped = true;
      await Promise.allSettled([...this.writeQueues.values(), ...this.pendingTails]);
    };
    this.publish(await this.load());
  }
  /**
  * Absolute path of the provider's user-editable document, when its storage
  * is one local file. Configuration surfaces use this only as availability
  * metadata; the guarded open operation resolves the path again Host-side.
  * Non-file providers leave it undefined and expose no open-document affordance.
  * @returns the absolute local document path, or undefined for non-file storage.
  */
  get documentPath() {
  }
  /**
  * Prepare the provider's user-editable document for a native editor. File
  * providers may materialize an absent document before returning its path;
  * non-file providers return undefined.
  * @returns the absolute local document path, or undefined for non-file storage.
  */
  prepareDocument() {
    return Promise.resolve(this.documentPath);
  }
  /**
  * Register a namespace schema and receive its owner scope. The registration
  * is an effect on the calling plugin's fiber: disposing that fiber removes
  * the namespace and its observers. An invalid stored section fails the
  * registration itself — the earliest point where the schema can judge it.
  * @param ns - unique namespace; duplicate registration fails loud.
  * @param schema - schemastery schema resolving this namespace's value.
  * @param options - composition `base` layer and effect timing.
  * @returns the owner scope for reads, observation, and updates.
  */
  register(ns, schema, options) {
    if (this.registrations.has(ns)) throw new Error(`settings namespace "${ns}" is already registered`);
    const registration = {
      ns,
      schema,
      base: options?.base,
      applies: options?.applies ?? "live",
      ...options?.validate === void 0 ? {} : { validate: options.validate },
      resolved: deepFreeze(this.resolve(schema, options?.base, this.section(ns), options?.validate)),
      revision: 0,
      watchers: /* @__PURE__ */ new Set()
    };
    this.ctx.effect(() => {
      this.registrations.set(ns, registration);
      return () => this.registrations.delete(ns);
    }, `settings.register(${JSON.stringify(String(ns))})`);
    return {
      get: () => registration.resolved,
      watch: (callback) => {
        const watcher = {
          callback,
          tail: Promise.resolve(),
          active: true
        };
        registration.watchers.add(watcher);
        return () => {
          watcher.active = false;
          registration.watchers.delete(watcher);
        };
      },
      update: (patch) => this.update(ns, patch),
      replace: (section) => this.replace(ns, section)
    };
  }
  /**
  * Describe every registered namespace for configuration surfaces, including
  * the composition `base` and raw user layers so a form can mark which fields
  * the user overrode (presence in `user`) and what a reset returns to.
  * @param options - redaction switch; wire surfaces must redact.
  * @returns one descriptor per registered namespace, in registration order.
  */
  describe(options) {
    return [...this.registrations.values()].map((registration) => {
      let user;
      try {
        user = this.section(registration.ns);
      } catch {
        user = void 0;
      }
      const base = registration.base === void 0 ? void 0 : structuredClone(registration.base);
      const detachedUser = user === void 0 ? void 0 : structuredClone(user);
      const descriptor = {
        ns: registration.ns,
        schema: registration.schema.toJSON(),
        value: registration.resolved,
        revision: registration.revision,
        ...base === void 0 ? {} : { base },
        ...detachedUser === void 0 ? {} : { user: detachedUser },
        applies: registration.applies
      };
      if (options?.redactSecrets !== true) return descriptor;
      const schema = registration.schema;
      const redacted = redactSecrets(schema, registration.resolved);
      return {
        ...descriptor,
        value: redacted.value,
        ...base === void 0 ? {} : { base: redactSecrets(schema, base).value },
        ...detachedUser === void 0 ? {} : { user: redactSecrets(schema, detachedUser).value },
        secrets: redacted.secrets
      };
    });
  }
  /**
  * Read one registered namespace's resolved value.
  * @param ns - the namespace to read.
  * @returns the resolved value, or `undefined` while unregistered.
  */
  get(ns) {
    return this.registrations.get(ns)?.resolved;
  }
  /**
  * Merge a patch into one registered namespace's user layer, validate the
  * resolved candidate, persist through the provider, then commit and emit.
  * A validation failure rejects before anything is persisted. Writes to one
  * namespace are serialized: concurrent updates apply in call order, each
  * merging over the previous write's committed section.
  * @param ns - the registered namespace to update.
  * @param patch - plain-object patch over the user section.
  * @param expectedRevision - the descriptor `revision` the caller read; a
  *   namespace that moved past it rejects with {@link SettingsConflictError}.
  */
  async update(ns, patch, expectedRevision) {
    return this.write(ns, patch, "merge", expectedRevision);
  }
  /**
  * Replace one registered namespace's user section wholesale, validate,
  * persist, then commit and emit. Keys absent from `section` fall back to the
  * composition `base` and schema defaults — this is the removal/reset path a
  * merge-only patch cannot express (`replace({})` re-inherits everything).
  * @param ns - the registered namespace to replace.
  * @param section - the complete next user section.
  * @param expectedRevision - the descriptor `revision` the caller read; a
  *   namespace that moved past it rejects with {@link SettingsConflictError}.
  */
  async replace(ns, section, expectedRevision) {
    return this.write(ns, section, "replace", expectedRevision);
  }
  /**
  * Apply path-addressed edits to one registered namespace's user section,
  * validate, persist, then commit and emit. The ops are applied to the
  * section as it stands when the write reaches the front of the queue, so a
  * caller never has to restate fields it did not touch — and, crucially,
  * cannot delete fields it never saw. This is the write path for any caller
  * holding a redacted view; `replace` remains the wholesale reset.
  * @param ns - the registered namespace to edit.
  * @param ops - ordered path edits; later ops observe earlier ones.
  * @param expectedRevision - the descriptor `revision` the caller read; a
  *   namespace that moved past it rejects with {@link SettingsConflictError}.
  */
  async mutate(ns, ops, expectedRevision) {
    if (!Array.isArray(ops)) throw new TypeError(`settings mutate for "${ns}" must be an array of path ops`);
    for (const op of ops) {
      if (!isPlainObject2(op) || op["op"] !== "set" && op["op"] !== "unset") throw new TypeError(`settings mutate for "${ns}" ops must be {op:'set'|'unset', path}`);
      if (!Array.isArray(op["path"]) || op["path"].some((part) => typeof part !== "string")) throw new TypeError(`settings mutate for "${ns}" op paths must be arrays of strings`);
    }
    return this.write(ns, ops, "mutate", expectedRevision);
  }
  /** Validate a write, then queue it on the namespace's serialized write chain. */
  write(ns, input, mode, expectedRevision) {
    const verb = mode === "merge" ? "update" : mode === "replace" ? "replace" : "mutate";
    const registration = this.registrations.get(ns);
    if (registration === void 0) throw new Error(`settings namespace "${ns}" is not registered`);
    if (this.isStopped()) throw new Error(`settings service is disposed: "${ns}" cannot be written`);
    if (!this.writable) throw new Error(`settings provider is read-only: "${ns}" cannot be updated in-process`);
    let payload;
    if (mode === "mutate") payload = { ops: input };
    else {
      if (!isPlainObject2(input)) throw new TypeError(`settings ${verb} for "${ns}" must be a plain object`);
      payload = input;
    }
    const snapshot = cloneJsonShaped(payload, (label, path) => /* @__PURE__ */ new TypeError(`settings ${verb} for "${ns}" must contain only JSON-compatible data (found ${label} at ${path})`));
    const run = (this.writeQueues.get(ns) ?? Promise.resolve()).catch(() => void 0).then(async () => {
      if (this.isStopped()) throw new Error(`settings service was disposed before the queued "${ns}" ${verb} ran`);
      if (this.registrations.get(ns) !== registration) throw new Error(`settings namespace "${ns}" registration was disposed before the queued ${verb} ran`);
      const current = this.section(ns) ?? {};
      if (expectedRevision !== void 0 && expectedRevision !== registration.revision) throw new SettingsConflictError(ns, expectedRevision, registration.revision);
      const section = mode === "merge" ? mergeLayers(current, snapshot) : mode === "replace" ? snapshot : snapshot["ops"].reduce(applyPathOp, current);
      const next = deepFreeze(this.resolve(registration.schema, registration.base, section, registration.validate));
      await this.persist(ns, section);
      this.document[ns] = section;
      if (this.registrations.get(ns) === registration && !this.isStopped()) {
        this.bumpRevision(registration, current, section);
        this.commit(registration, next, "update");
      }
    });
    this.writeQueues.set(ns, run);
    return run;
  }
  /**
  * Provider hook: commit a complete raw document observed in storage. Each
  * registered namespace re-resolves; an invalid section keeps that
  * namespace's last good value and warns, other namespaces still commit.
  * @param doc - the detached raw document (unregistered sections preserved).
  * @param source - change origin; defaults to `provider`.
  */
  publish(doc, source = "provider") {
    const before = /* @__PURE__ */ new Map();
    for (const registration of this.registrations.values()) try {
      before.set(registration.ns, this.section(registration.ns));
    } catch {
      before.set(registration.ns, void 0);
    }
    this.document = doc;
    for (const registration of this.registrations.values()) {
      let next;
      try {
        next = deepFreeze(this.resolve(registration.schema, registration.base, this.section(registration.ns), registration.validate));
      } catch (error) {
        this.ctx.logger.warn('settings: keeping last good "%s" after invalid stored section', registration.ns);
        this.ctx.logger.warn(error);
        continue;
      }
      this.bumpRevision(registration, before.get(registration.ns), this.section(registration.ns));
      this.commit(registration, next, source);
    }
  }
  /** Read one namespace's raw user section, rejecting non-object sections. */
  section(ns) {
    const section = this.document[ns];
    if (section === void 0) return void 0;
    if (!isPlainObject2(section)) throw new TypeError(`settings section "${ns}" must be an object of keys`);
    return section;
  }
  /** Resolve one namespace value: schema defaults, then `base`, then the user layer. */
  resolve(schema, base, section, validate) {
    const value = schema(mergeLayers(base, section));
    validate?.(value);
    return value;
  }
  /**
  * Advance a namespace's revision when its RAW section changed, and announce
  * it. Deliberately independent of {@link commit}'s resolved-value equality:
  * storing an override equal to the composition base leaves the resolved
  * value alone but changes what the document says, which is exactly what a
  * configuration surface must re-read.
  */
  bumpRevision(registration, before, after) {
    if (deepEqualJson(before, after)) return;
    registration.revision += 1;
    this.emitDocumentUpdated(registration.ns, registration.revision);
  }
  /** Contained fan-out of `settings/document-updated`, mirroring {@link commit}'s. */
  emitDocumentUpdated(ns, revision) {
    let invariantFailure;
    const args = [
      "settings/document-updated",
      ns,
      revision
    ];
    for (const listener of this.ctx.events.dispatch("emit", args)) try {
      const returned = listener(ns, revision);
      if (returned != null && typeof returned.then === "function") Promise.resolve(returned).then(void 0, (error) => {
        this.warnListenerFailure(ns, error);
      });
    } catch (error) {
      if (error?.code === "INVARIANT") {
        invariantFailure ??= error;
        continue;
      }
      this.warnListenerFailure(ns, error);
    }
    if (invariantFailure !== void 0) throw invariantFailure;
  }
  /** Commit a resolved value when changed: swap, notify watchers, emit the event. */
  commit(registration, next, source) {
    const prev = registration.resolved;
    if (deepEqualJson(next, prev)) return;
    registration.resolved = next;
    for (const watcher of [...registration.watchers]) {
      const segment = watcher.tail.then(() => {
        if (!watcher.active || this.isStopped()) return;
        return watcher.callback(next, prev);
      }).then(() => void 0, (error) => {
        this.warnWatcherFailure(registration.ns, error);
      });
      watcher.tail = segment;
      this.pendingTails.add(segment);
      segment.then(() => this.pendingTails.delete(segment));
    }
    let invariantFailure;
    const args = [
      "settings/updated",
      registration.ns,
      next,
      prev,
      source
    ];
    for (const listener of this.ctx.events.dispatch("emit", args)) try {
      const returned = listener(registration.ns, next, prev, source);
      if (returned != null && typeof returned.then === "function") Promise.resolve(returned).then(void 0, (error) => {
        this.warnListenerFailure(registration.ns, error);
      });
    } catch (error) {
      if (error?.code === "INVARIANT") {
        invariantFailure ??= error;
        continue;
      }
      this.warnListenerFailure(registration.ns, error);
    }
    if (invariantFailure !== void 0) throw invariantFailure;
  }
  /** Contained-watcher diagnostic shared by the sync and async failure paths. */
  warnWatcherFailure(ns, error) {
    this.ctx.logger.warn('settings: watcher for "%s" failed', ns);
    this.ctx.logger.warn(error);
  }
  /** Contained-listener diagnostic shared by the sync and async failure paths. */
  warnListenerFailure(ns, error) {
    this.ctx.logger.warn('settings: a settings/updated listener for "%s" failed', ns);
    this.ctx.logger.warn(error);
  }
};

// echoflowai-tools/src/models/delivery.ts
var MANAGED_FLAG = "openluxManaged";
var MANAGED_TAG = "\u684C\u9762\u63A8\u8350";
var FALLBACK_MODELS = [
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "claude-opus-4-8",
  "gemini-3.1-pro-preview",
  "gpt-5.4"
];
function isManaged(entry) {
  return entry[MANAGED_FLAG] === true;
}
function tagsOf(model) {
  return (model.tags ?? "").split(/[,，\s]+/).filter((tag) => tag !== "");
}
function deliveredIds(pool) {
  const tagged = pool.filter((model) => tagsOf(model).includes(MANAGED_TAG)).map((model) => model.id);
  if (tagged.length > 0) return tagged;
  const available = new Set(pool.map((model) => model.id));
  return FALLBACK_MODELS.filter((id) => available.has(id));
}
function merge(delivered, kept) {
  const managed = delivered.map((id) => ({ id, [MANAGED_FLAG]: true }));
  const taken = new Set(delivered);
  return [...managed, ...kept.filter((entry) => !taken.has(entry.id))];
}

// echoflowai-tools/src/models/profiles.ts
var THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
var THINKING_FORMATS = /* @__PURE__ */ new Set([
  "openai",
  "zai",
  "qwen",
  "qwen-chat-template",
  "chat-template",
  "deepseek",
  "openrouter",
  "ant-ling",
  "together",
  "string-thinking"
]);
var BUILTIN_SCOPE = "yunwu";
var PROFILES_TIMEOUT_MS = 8e3;
async function fetchModelOverrides(access2, signal) {
  const token = await access2.apiKey();
  if (token === void 0 || token.trim() === "") throw new Error("no desktop token");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROFILES_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(`${access2.baseUrl.replace(/\/+$/, "")}/api/desktop-config`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`desktop config returned HTTP ${String(response.status)}`);
    }
    const envelope = await response.json();
    if (envelope.success !== true) {
      throw new Error(envelope.message?.trim() || "desktop config returned an invalid envelope");
    }
    const section = envelope.data?.modelCapabilities;
    if (section?.rollout?.enabled !== true) return { enabled: false, overrides: /* @__PURE__ */ new Map() };
    return { enabled: true, overrides: parseItems(section.items) };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}
function parseItems(items) {
  const out = /* @__PURE__ */ new Map();
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    const id = typeof item.model_name === "string" ? item.model_name.trim() : "";
    if (id === "") continue;
    const scope = typeof item.provider_scope === "string" ? item.provider_scope.trim() : BUILTIN_SCOPE;
    if (scope !== BUILTIN_SCOPE) continue;
    const category = typeof item.category === "string" ? item.category.trim() : "chat";
    if (category !== "chat") continue;
    const input = parseModalities(item.input);
    const thinking = parseThinking(item.thinking);
    const name = typeof item.name === "string" && item.name.trim() !== "" ? item.name.trim() : void 0;
    const contextWindow = parseTokens(item.context_window);
    const maxTokens = parseTokens(item.max_output_tokens);
    const override = {
      ...input === void 0 ? {} : { input },
      ...thinking === void 0 ? {} : { thinking },
      ...name === void 0 ? {} : { name },
      ...contextWindow === void 0 ? {} : { contextWindow },
      ...maxTokens === void 0 ? {} : { maxTokens }
    };
    if (Object.keys(override).length === 0) continue;
    out.set(id, override);
  }
  return out;
}
function parseTokens(raw) {
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : void 0;
}
function parseThinking(raw) {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return void 0;
  const value = raw;
  if (typeof value.efforts !== "object" || value.efforts === null || Array.isArray(value.efforts)) {
    return void 0;
  }
  const efforts = {};
  let offered = 0;
  for (const [level, wire] of Object.entries(value.efforts)) {
    if (!THINKING_LEVELS.includes(level)) return void 0;
    if (level === "off") {
      if (wire !== null && (typeof wire !== "string" || wire === "")) return void 0;
      efforts[level] = wire;
      continue;
    }
    if (typeof wire !== "string" || wire === "") return void 0;
    efforts[level] = wire;
    offered += 1;
  }
  const levels = Object.keys(efforts);
  if (levels.length > 0 && offered === 0) return void 0;
  if (levels.length === 0) return { efforts: {} };
  const format = value.format;
  if (format !== void 0 && (typeof format !== "string" || !THINKING_FORMATS.has(format))) {
    return void 0;
  }
  const supports = value.supports_reasoning_effort;
  if (supports !== void 0 && typeof supports !== "boolean") return void 0;
  return {
    efforts,
    ...format === void 0 ? {} : { format },
    ...supports === void 0 ? {} : { supportsReasoningEffort: supports }
  };
}
function parseModalities(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return void 0;
  const out = [];
  for (const value of raw) {
    if (value !== "text" && value !== "image") return void 0;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}

// echoflowai-tools/src/models/delivered.ts
var DELIVERY_TIMEOUT_MS = 8e3;
function normalizeNames(value) {
  if (!Array.isArray(value)) return [];
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (name === "" || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}
function normalizedOptionalName(value) {
  if (typeof value !== "string") return void 0;
  const name = value.trim();
  return name === "" ? void 0 : name;
}
async function fetchDeliveredModelConfig(access2, signal) {
  const token = await access2.apiKey();
  if (token === void 0 || token.trim() === "") throw new Error("no desktop token");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(`${access2.baseUrl.replace(/\/+$/, "")}/api/desktop-config/model-delivery`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`model delivery returned HTTP ${String(response.status)}`);
    }
    const envelope = await response.json();
    if (envelope.success !== true || envelope.data === void 0) {
      throw new Error(envelope.message?.trim() || "model delivery returned an invalid envelope");
    }
    const wire = envelope.data;
    const source = wire.intent ?? wire;
    const configured = source.configured === true || source.configured === 1;
    const defaultImageModel = normalizedOptionalName(source.default_image_model);
    const defaultVideoModel = normalizedOptionalName(source.default_video_model);
    return {
      configured,
      revision: typeof wire.intent_revision === "number" ? wire.intent_revision : typeof source.revision === "number" ? source.revision : typeof wire.revision === "number" ? wire.revision : 0,
      chatModels: normalizeNames(source.chat_models),
      searchModels: normalizeNames(source.search_models),
      ...defaultImageModel === void 0 ? {} : { defaultImageModel },
      ...defaultVideoModel === void 0 ? {} : { defaultVideoModel }
    };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

// echoflowai-tools/src/models/pool.ts
var import_node_crypto = require("node:crypto");

// echoflowai-tools/node_modules/@deepseek-ai/dsh-timeout/lib/index.js
var TimeoutReason = class extends Error {
  code;
  timeoutMs;
  name = "TimeoutReason";
  /**
  * @param code Capability-owned timeout code (e.g. `BASH_TIMEOUT`).
  * @param timeoutMs The deadline that elapsed, in milliseconds.
  */
  constructor(code, timeoutMs) {
    super(`${code} after ${timeoutMs}ms`);
    this.code = code;
    this.timeoutMs = timeoutMs;
  }
};
var MAX_TIMER_DELAY_MS = 2147483647;
function assertTimerDelay(timeoutMs, name) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647) throw new Error(`${name} must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
}
function deadline(upstream, timeoutMs, code) {
  if (timeoutMs <= 0) return {
    signal: upstream ?? new AbortController().signal,
    [Symbol.dispose]() {
    }
  };
  assertTimerDelay(timeoutMs, "deadline timeoutMs");
  const timer = new AbortController();
  const id = setTimeout(() => {
    timer.abort(new TimeoutReason(code, timeoutMs));
  }, timeoutMs);
  return {
    signal: upstream !== void 0 ? AbortSignal.any([upstream, timer.signal]) : timer.signal,
    [Symbol.dispose]() {
      clearTimeout(id);
    }
  };
}
function timeoutOf(x, code) {
  const reason = x.reason;
  if (!(reason instanceof TimeoutReason)) return void 0;
  return code === void 0 || reason.code === code ? reason : void 0;
}

// echoflowai-tools/node_modules/@deepseek-ai/schemastery/lib/index.mjs
var kSchema = /* @__PURE__ */ Symbol.for("schemastery");
var kValidationError2 = /* @__PURE__ */ Symbol.for("ValidationError");
globalThis.__schemastery_index__ ??= 0;
globalThis.__schemastery_refs__ = void 0;
var ValidationError2 = class extends TypeError {
  options;
  name = "ValidationError";
  constructor(message, options) {
    let prefix = "$";
    for (const segment of options.path || []) if (typeof segment === "string") prefix += "." + segment;
    else if (typeof segment === "number") prefix += "[" + segment + "]";
    else if (typeof segment === "symbol") prefix += `[Symbol(${segment.toString()})]`;
    if (prefix.startsWith(".")) prefix = prefix.slice(1);
    super((prefix === "$" ? "" : `${prefix} `) + message);
    this.options = options;
  }
  static is(error) {
    return !!error?.[kValidationError2];
  }
};
Object.defineProperty(ValidationError2.prototype, kValidationError2, { value: true });
var Schema = function(options) {
  const schema = function(data, options2 = {}) {
    return Schema.resolve(data, schema, options2)[0];
  };
  if (options.refs) {
    const refs = mapValues(options.refs, (options2) => new Schema(options2));
    const getRef = (uid) => refs[uid];
    for (const key in refs) {
      const options2 = refs[key];
      options2.sKey = getRef(options2.sKey);
      options2.inner = getRef(options2.inner);
      options2.list = options2.list && options2.list.map(getRef);
      options2.dict = options2.dict && mapValues(options2.dict, getRef);
    }
    return refs[options.uid];
  }
  Object.assign(schema, options);
  if (typeof schema.callback === "string") try {
    schema.callback = new Function("return " + schema.callback)();
  } catch {
  }
  Object.defineProperty(schema, "uid", { value: globalThis.__schemastery_index__++ });
  Object.setPrototypeOf(schema, Schema.prototype);
  schema.meta ||= {};
  schema.toString = schema.toString.bind(schema);
  return schema;
};
Schema.prototype = Object.create(Function.prototype);
Schema.prototype[kSchema] = true;
Object.defineProperty(Schema.prototype, "~standard", { get() {
  return {
    version: 1,
    vendor: "schemastery",
    validate: (value) => {
      try {
        return { value: Schema.resolve(value, this, {})[0] };
      } catch (error) {
        if (ValidationError2.is(error)) return { issues: [{
          message: error.message,
          path: error.options.path
        }] };
        throw error;
      }
    }
  };
} });
Schema.ValidationError = ValidationError2;
Schema.prototype.toJSON = function toJSON() {
  if (globalThis.__schemastery_refs__) {
    globalThis.__schemastery_refs__[this.uid] ??= JSON.parse(JSON.stringify({ ...this }));
    return this.uid;
  }
  globalThis.__schemastery_refs__ = { [this.uid]: { ...this } };
  globalThis.__schemastery_refs__[this.uid] = JSON.parse(JSON.stringify({ ...this }));
  const result = {
    uid: this.uid,
    refs: globalThis.__schemastery_refs__
  };
  globalThis.__schemastery_refs__ = void 0;
  return result;
};
Schema.prototype.set = function set(key, value) {
  this.dict[key] = value;
  return this;
};
Schema.prototype.push = function push(value) {
  this.list.push(value);
  return this;
};
function mergeDesc(original, messages) {
  const result = typeof original === "string" ? { "": original } : { ...original };
  for (const locale in messages) {
    const value = messages[locale];
    if (value?.$description || value?.$desc) result[locale] = value.$description || value.$desc;
    else if (typeof value === "string") result[locale] = value;
  }
  return result;
}
function getInner(value) {
  return value?.$value ?? value?.$inner;
}
function extractKeys(data) {
  return filterKeys(data ?? {}, (key) => !key.startsWith("$"));
}
Schema.prototype.i18n = function i18n(messages) {
  const schema = Schema(this);
  const desc = mergeDesc(schema.meta.description, messages);
  if (Object.keys(desc).length) schema.meta.description = desc;
  if (schema.dict) schema.dict = mapValues(schema.dict, (inner, key) => {
    return inner.i18n(mapValues(messages, (data) => getInner(data)?.[key] ?? data?.[key]));
  });
  if (schema.list) schema.list = schema.list.map((inner, index) => {
    return inner.i18n(mapValues(messages, (data = {}) => {
      if (Array.isArray(getInner(data))) return getInner(data)[index];
      if (Array.isArray(data)) return data[index];
      return extractKeys(data);
    }));
  });
  if (schema.inner) schema.inner = schema.inner.i18n(mapValues(messages, (data) => {
    if (getInner(data)) return getInner(data);
    return extractKeys(data);
  }));
  if (schema.sKey) schema.sKey = schema.sKey.i18n(mapValues(messages, (data) => data?.$key));
  return schema;
};
Schema.prototype.extra = function extra(key, value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
};
for (const key of [
  "required",
  "disabled",
  "collapse",
  "hidden",
  "loose"
]) Object.assign(Schema.prototype, { [key](value = true) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
Schema.prototype.deprecated = function deprecated() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "deprecated",
    type: "danger"
  });
  return schema;
};
Schema.prototype.experimental = function experimental() {
  const schema = Schema(this);
  schema.meta.badges ||= [];
  schema.meta.badges.push({
    text: "experimental",
    type: "warning"
  });
  return schema;
};
Schema.prototype.pattern = function pattern(regexp) {
  const schema = Schema(this);
  const pattern2 = pick(regexp, ["source", "flags"]);
  schema.meta = {
    ...schema.meta,
    pattern: pattern2
  };
  return schema;
};
Schema.prototype.simplify = function simplify(value) {
  if (deepEqual(value, this.meta.default, this.type === "dict")) return null;
  if (isNullable(value)) return value;
  if (this.type === "object" || this.type === "dict") {
    const result = {};
    for (const key in value) {
      const item = (this.type === "object" ? this.dict[key] : this.inner)?.simplify(value[key]);
      if (this.type === "dict" || !isNullable(item)) result[key] = item;
    }
    if (deepEqual(result, this.meta.default, this.type === "dict")) return null;
    return result;
  } else if (this.type === "array" || this.type === "tuple") {
    const result = [];
    value.forEach((value2, index) => {
      const schema = this.type === "array" ? this.inner : this.list[index];
      const item = schema ? schema.simplify(value2) : value2;
      result.push(item);
    });
    return result;
  } else if (this.type === "intersect") {
    const result = {};
    for (const item of this.list) Object.assign(result, item.simplify(value));
    return result;
  } else if (this.type === "union") for (const schema of this.list) try {
    Schema.resolve(value, schema, {});
    return schema.simplify(value);
  } catch {
  }
  return value;
};
Schema.prototype.toString = function toString(inline) {
  return formatters[this.type]?.(this, inline) ?? `Schema<${this.type}>`;
};
Schema.prototype.role = function role(role, extra2) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    role,
    extra: extra2
  };
  return schema;
};
for (const key of [
  "default",
  "link",
  "comment",
  "description",
  "max",
  "min",
  "step"
]) Object.assign(Schema.prototype, { [key](value) {
  const schema = Schema(this);
  schema.meta = {
    ...schema.meta,
    [key]: value
  };
  return schema;
} });
var resolvers = {};
Schema.extend = function extend(type, resolve2) {
  resolvers[type] = resolve2;
};
Schema.resolve = function resolve(data, schema, options = {}, strict = false) {
  if (!schema) return [data];
  if (options.ignore?.(data, schema)) return [data];
  if (isNullable(data) && schema.type !== "lazy") {
    if (schema.meta.required) throw new ValidationError2(`missing required value`, options);
    let current = schema;
    let fallback = schema.meta.default;
    while (current?.type === "intersect" && isNullable(fallback)) {
      current = current.list[0];
      fallback = current?.meta.default;
    }
    if (isNullable(fallback)) return [data];
    data = clone(fallback);
  }
  const callback = resolvers[schema.type];
  if (!callback) throw new ValidationError2(`unsupported type "${schema.type}"`, options);
  try {
    return callback(data, schema, options, strict);
  } catch (error) {
    if (!schema.meta.loose) throw error;
    return [schema.meta.default];
  }
};
Schema.from = function from(source) {
  if (isNullable(source)) return Schema.any();
  else if ([
    "string",
    "number",
    "boolean"
  ].includes(typeof source)) return Schema.const(source).required();
  else if (source[kSchema]) return source;
  else if (typeof source === "function") switch (source) {
    case String:
      return Schema.string().required();
    case Number:
      return Schema.number().required();
    case Boolean:
      return Schema.boolean().required();
    case Function:
      return Schema.function().required();
    default:
      return Schema.is(source).required();
  }
  else throw new TypeError(`cannot infer schema from ${source}`);
};
Schema.lazy = function lazy(builder) {
  const toJSON2 = () => {
    if (!schema.inner[kSchema]) {
      schema.inner = schema.builder();
      schema.inner.meta = {
        ...schema.meta,
        ...schema.inner.meta
      };
    }
    return schema.inner.toJSON();
  };
  const schema = new Schema({
    type: "lazy",
    builder,
    inner: { toJSON: toJSON2 }
  });
  return schema;
};
Schema.natural = function natural() {
  return Schema.number().step(1).min(0);
};
Schema.percent = function percent() {
  return Schema.number().step(0.01).min(0).max(1).role("slider");
};
Schema.date = function date() {
  return Schema.union([Schema.is(Date), Schema.transform(Schema.string().role("datetime"), (value, options) => {
    const date2 = new Date(value);
    if (isNaN(+date2)) throw new ValidationError2(`invalid date "${value}"`, options);
    return date2;
  }, true)]);
};
Schema.regExp = function regExp(flag = "") {
  return Schema.union([Schema.is(RegExp), Schema.transform(Schema.string().role("regexp", { flag }), (value, options) => {
    try {
      return new RegExp(value, flag);
    } catch (e) {
      throw new ValidationError2(e.message, options);
    }
  }, true)]);
};
Schema.arrayBuffer = function arrayBuffer(encoding) {
  return Schema.union([
    Schema.is(ArrayBuffer),
    Schema.is(SharedArrayBuffer),
    Schema.transform(Schema.any(), (value, options) => {
      if (Binary.isSource(value)) return Binary.fromSource(value);
      throw new ValidationError2(`expected ArrayBufferSource but got ${value}`, options);
    }, true),
    ...encoding ? [Schema.transform(Schema.string(), (value, options) => {
      try {
        return encoding === "base64" ? Binary.fromBase64(value) : Binary.fromHex(value);
      } catch (e) {
        throw new ValidationError2(e.message, options);
      }
    }, true)] : []
  ]);
};
Schema.extend("lazy", (data, schema, options, strict) => {
  if (!schema.inner[kSchema]) {
    schema.inner = schema.builder();
    schema.inner.meta = {
      ...schema.meta,
      ...schema.inner.meta
    };
  }
  return Schema.resolve(data, schema.inner, options, strict);
});
Schema.extend("any", (data) => {
  return [data];
});
Schema.extend("never", (data, _, options) => {
  throw new ValidationError2(`expected nullable but got ${data}`, options);
});
Schema.extend("const", (data, { value }, options) => {
  if (deepEqual(data, value)) return [value];
  throw new ValidationError2(`expected ${value} but got ${data}`, options);
});
function checkWithinRange(data, meta, description, options, skipMin = false) {
  const { max = Infinity, min = -Infinity } = meta;
  if (data > max) throw new ValidationError2(`expected ${description} <= ${max} but got ${data}`, options);
  if (data < min && !skipMin) throw new ValidationError2(`expected ${description} >= ${min} but got ${data}`, options);
}
Schema.extend("string", (data, { meta }, options) => {
  if (typeof data !== "string") throw new ValidationError2(`expected string but got ${data}`, options);
  if (meta.pattern) {
    const regexp = new RegExp(meta.pattern.source, meta.pattern.flags);
    if (!regexp.test(data)) throw new ValidationError2(`expect string to match regexp ${regexp}`, options);
  }
  checkWithinRange(data.length, meta, "string length", options);
  return [data];
});
function decimalShift(data, digits) {
  const str = data.toString();
  if (str.includes("e")) return data * Math.pow(10, digits);
  const index = str.indexOf(".");
  if (index === -1) return data * Math.pow(10, digits);
  const frac = str.slice(index + 1);
  const integer = str.slice(0, index);
  if (frac.length <= digits) return +(integer + frac.padEnd(digits, "0"));
  return +(integer + frac.slice(0, digits) + "." + frac.slice(digits));
}
function isMultipleOf(data, min, step) {
  step = Math.abs(step);
  if (!/^\d+\.\d+$/.test(step.toString())) return (data - min) % step === 0;
  const index = step.toString().indexOf(".");
  const digits = step.toString().slice(index + 1).length;
  return Math.abs(decimalShift(data, digits) - decimalShift(min, digits)) % decimalShift(step, digits) === 0;
}
Schema.extend("number", (data, { meta }, options) => {
  if (typeof data !== "number") throw new ValidationError2(`expected number but got ${data}`, options);
  checkWithinRange(data, meta, "number", options);
  const { step } = meta;
  if (step && !isMultipleOf(data, meta.min ?? 0, step)) throw new ValidationError2(`expected number multiple of ${step} but got ${data}`, options);
  return [data];
});
Schema.extend("boolean", (data, _, options) => {
  if (typeof data === "boolean") return [data];
  throw new ValidationError2(`expected boolean but got ${data}`, options);
});
Schema.extend("bitset", (data, { bits, meta }, options) => {
  let value = 0, keys = [];
  if (typeof data === "number") {
    value = data;
    for (const key in bits) if (data & bits[key]) keys.push(key);
  } else if (Array.isArray(data)) {
    keys = data;
    for (const key of keys) {
      if (typeof key !== "string") throw new ValidationError2(`expected string but got ${key}`, options);
      if (key in bits) value |= bits[key];
    }
  } else throw new ValidationError2(`expected number or array but got ${data}`, options);
  if (value === meta.default) return [value];
  return [value, keys];
});
Schema.extend("function", (data, _, options) => {
  if (typeof data === "function") return [data];
  throw new ValidationError2(`expected function but got ${data}`, options);
});
Schema.extend("is", (data, { constructor }, options) => {
  if (typeof constructor === "function") {
    if (data instanceof constructor) return [data];
    throw new ValidationError2(`expected ${constructor.name} but got ${data}`, options);
  } else {
    if (isNullable(data)) throw new ValidationError2(`expected ${constructor} but got ${data}`, options);
    let prototype = Object.getPrototypeOf(data);
    while (prototype) {
      if (prototype.constructor?.name === constructor) return [data];
      prototype = Object.getPrototypeOf(prototype);
    }
    throw new ValidationError2(`expected ${constructor} but got ${data}`, options);
  }
});
function property(data, key, schema, options) {
  try {
    const [value, adapted] = Schema.resolve(data[key], schema, {
      ...options,
      path: [...options.path || [], key]
    });
    if (adapted !== void 0) data[key] = adapted;
    return value;
  } catch (e) {
    if (!options?.autofix) throw e;
    delete data[key];
    return schema.meta.default;
  }
}
Schema.extend("array", (data, { inner, meta }, options) => {
  if (!Array.isArray(data)) throw new ValidationError2(`expected array but got ${data}`, options);
  checkWithinRange(data.length, meta, "array length", options, !isNullable(inner.meta.default));
  return [data.map((_, index) => property(data, index, inner, options))];
});
Schema.extend("dict", (data, { inner, sKey }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError2(`expected object but got ${data}`, options);
  const result = {};
  for (const key in data) {
    let rKey;
    try {
      rKey = Schema.resolve(key, sKey, options)[0];
    } catch (error) {
      if (strict) continue;
      throw error;
    }
    result[rKey] = property(data, key, inner, options);
    data[rKey] = data[key];
    if (key !== rKey) delete data[key];
  }
  return [result];
});
Schema.extend("tuple", (data, { list }, options, strict) => {
  if (!Array.isArray(data)) throw new ValidationError2(`expected array but got ${data}`, options);
  const result = list.map((inner, index) => property(data, index, inner, options));
  if (strict) return [result];
  result.push(...data.slice(list.length));
  return [result];
});
function merge2(result, data) {
  for (const key in data) {
    if (key in result) continue;
    result[key] = data[key];
  }
}
Schema.extend("object", (data, { dict }, options, strict) => {
  if (!isPlainObject(data)) throw new ValidationError2(`expected object but got ${data}`, options);
  const result = {};
  for (const key in dict) {
    const value = property(data, key, dict[key], options);
    if (!isNullable(value) || key in data) result[key] = value;
  }
  if (!strict) merge2(result, data);
  return [result];
});
Schema.extend("union", (data, { list, toString: toString2 }, options, strict) => {
  const messages = [];
  for (const inner of list) try {
    return Schema.resolve(data, inner, options, strict);
  } catch (error) {
    messages.push(error);
  }
  throw new ValidationError2(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
});
Schema.extend("intersect", (data, { list, toString: toString2 }, options, strict) => {
  if (!list.length) return [data];
  let result;
  for (const inner of list) {
    const value = Schema.resolve(data, inner, options, true)[0];
    if (isNullable(value)) continue;
    if (isNullable(result)) result = value;
    else if (typeof result !== typeof value) throw new ValidationError2(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
    else if (typeof value === "object") merge2(result ??= {}, value);
    else if (result !== value) throw new ValidationError2(`expected ${toString2()} but got ${JSON.stringify(data)}`, options);
  }
  if (!strict && isPlainObject(data)) merge2(result, data);
  return [result];
});
Schema.extend("transform", (data, { inner, callback, preserve }, options) => {
  const [result, adapted = data] = Schema.resolve(data, inner, options, true);
  if (preserve) return [callback(result)];
  else return [callback(result), callback(adapted)];
});
var formatters = {};
function defineMethod(name, keys, format) {
  formatters[name] = format;
  Object.assign(Schema, { [name](...args) {
    const schema = new Schema({ type: name });
    keys.forEach((key, index) => {
      switch (key) {
        case "sKey":
          schema.sKey = args[index] ?? Schema.string();
          break;
        case "inner":
          schema.inner = Schema.from(args[index]);
          break;
        case "list":
          schema.list = args[index].map(Schema.from);
          break;
        case "dict":
          schema.dict = mapValues(args[index], Schema.from);
          break;
        case "bits":
          schema.bits = {};
          for (const key2 in args[index]) {
            if (typeof args[index][key2] !== "number") continue;
            schema.bits[key2] = args[index][key2];
          }
          break;
        case "callback": {
          const callback = schema.callback = args[index];
          callback["toJSON"] ||= () => callback.toString();
          break;
        }
        case "constructor": {
          const constructor = schema.constructor = args[index];
          if (typeof constructor === "function") constructor["toJSON"] ||= () => constructor["name"];
          break;
        }
        default:
          schema[key] = args[index];
      }
    });
    if (name === "object" || name === "dict") schema.meta.default = {};
    else if (name === "array" || name === "tuple") schema.meta.default = [];
    else if (name === "bitset") schema.meta.default = 0;
    return schema;
  } });
}
defineMethod("is", ["constructor"], ({ constructor }) => {
  if (typeof constructor === "function") return constructor.name;
  else return constructor;
});
defineMethod("any", [], () => "any");
defineMethod("never", [], () => "never");
defineMethod("const", ["value"], ({ value }) => typeof value === "string" ? JSON.stringify(value) : value);
defineMethod("string", [], () => "string");
defineMethod("number", [], () => "number");
defineMethod("boolean", [], () => "boolean");
defineMethod("bitset", ["bits"], () => "bitset");
defineMethod("function", [], () => "function");
defineMethod("array", ["inner"], ({ inner }) => `${inner.toString(true)}[]`);
defineMethod("dict", ["inner", "sKey"], ({ inner, sKey }) => `{ [key: ${sKey.toString()}]: ${inner.toString()} }`);
defineMethod("tuple", ["list"], ({ list }) => `[${list.map((inner) => inner.toString()).join(", ")}]`);
defineMethod("object", ["dict"], ({ dict }) => {
  if (Object.keys(dict).length === 0) return "{}";
  return `{ ${Object.entries(dict).map(([key, inner]) => {
    return `${key}${inner.meta.required ? "" : "?"}: ${inner.toString()}`;
  }).join(", ")} }`;
});
defineMethod("union", ["list"], ({ list }, inline) => {
  const result = list.map(({ toString: format }) => format()).join(" | ");
  return inline ? `(${result})` : result;
});
defineMethod("intersect", ["list"], ({ list }) => {
  return `${list.map((inner) => inner.toString(true)).join(" & ")}`;
});
defineMethod("transform", [
  "inner",
  "callback",
  "preserve"
], ({ inner }, isInner) => inner.toString(isInner));

// echoflowai-tools/node_modules/@deepseek-ai/dsh-client-locale/lib/index.js
var LOCALE_SETTINGS_NAMESPACE = "locale";
var LOCALE_PREFERENCE_FIELD = "preference";
var LOCALE_IDS = ["zh", "en"];
var LocaleSettingsSchema = Schema.object({ [LOCALE_PREFERENCE_FIELD]: Schema.union([...LOCALE_IDS]).required(false) });

// echoflowai-tools/src/error-cause.ts
var DEPTH = 4;
function causeChain(error) {
  const parts = [];
  let current = error;
  for (let depth = 0; depth < DEPTH && current instanceof Error; depth += 1) {
    const code = current.code;
    parts.push(code === void 0 ? current.message : `${current.message} (${String(code)})`);
    current = current.cause;
  }
  if (parts.length === 0) parts.push(String(error));
  return parts.join(" \u2190 ");
}

// echoflowai-tools/src/account/http.ts
var ACCOUNT_TIMEOUT_MS = 15e3;
var AccountRequestError = class extends Error {
  /**
   * @param message - human-readable Chinese text, shown as-is in the UI.
   * @param kind - which of the three no-reply outcomes happened.
   */
  constructor(message, kind) {
    super(message);
    this.kind = kind;
    this.name = "AccountRequestError";
  }
  kind;
};
function normalizeBase(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed === "") throw new AccountRequestError("\u8D26\u53F7\u670D\u52A1\u5730\u5740\u4E3A\u7A7A", "unreachable");
  return trimmed;
}
function acceptLanguage(ctx2) {
  const settings2 = ctx2.get("settings");
  const locale = settings2?.get(settingsNamespace(LOCALE_SETTINGS_NAMESPACE));
  return locale?.preference === "en" ? "en-US" : "zh-CN";
}
async function requestJson(ctx2, url, init, timeoutMs, upstream) {
  using budget = deadline(upstream, timeoutMs, "openlux-account");
  let response;
  try {
    const headers = new Headers(init.headers);
    headers.set("Accept-Language", acceptLanguage(ctx2));
    response = await fetch(url, { ...init, headers, signal: budget.signal });
  } catch (error) {
    const timedOut = timeoutOf(budget.signal);
    if (timedOut !== void 0) {
      throw new AccountRequestError(`\u8D26\u53F7\u670D\u52A1\u8D85\u65F6\uFF08${Math.round(timeoutMs / 1e3)} \u79D2\u672A\u54CD\u5E94\uFF09`, "timeout");
    }
    if (upstream?.aborted === true) throw new AccountRequestError("\u8BF7\u6C42\u5DF2\u53D6\u6D88", "cancelled");
    throw new AccountRequestError(`\u65E0\u6CD5\u8FDE\u63A5\u8D26\u53F7\u670D\u52A1\uFF1A${causeChain(error)}`, "unreachable");
  }
  const body = await response.json().catch(() => void 0);
  return { response, body };
}

// echoflowai-tools/src/models/runtime-cache.ts
var invalidators = /* @__PURE__ */ new Set();
function registerModelCacheInvalidator(invalidate) {
  invalidators.add(invalidate);
}

// echoflowai-tools/src/models/pool.ts
var CALLABLE_CACHE_TTL_MS = 2 * 6e4;
var SQUARE_CACHE_TTL_MS = 6e4;
var MAX_TOKEN_CACHE_ENTRIES = 8;
var callableCache = /* @__PURE__ */ new Map();
var callableFlights = /* @__PURE__ */ new Map();
var squareCache = /* @__PURE__ */ new Map();
var squareFlights = /* @__PURE__ */ new Map();
function tokenDigest(apiKey) {
  return (0, import_node_crypto.createHash)("sha256").update(apiKey).digest("hex").slice(0, 24);
}
function invalidateModelPool(apiKey) {
  if (apiKey === void 0) {
    callableCache.clear();
    callableFlights.clear();
    return;
  }
  const suffix = `|${tokenDigest(apiKey)}`;
  for (const key of callableCache.keys()) {
    if (key.endsWith(suffix)) callableCache.delete(key);
  }
  for (const key of callableFlights.keys()) {
    if (key.endsWith(suffix)) callableFlights.delete(key);
  }
}
registerModelCacheInvalidator(() => invalidateModelPool());
function textOf(value) {
  return typeof value === "string" ? value.trim() : "";
}
function isChatModelType(value) {
  const modelType = textOf(value);
  if (modelType.includes("\u5BF9\u8BDD")) return true;
  const normalized = modelType.toLowerCase();
  return normalized === "chat" || normalized === "text";
}
function includesAny(value, needles) {
  const normalized = value.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}
function hasWord(value, words) {
  const normalized = value.toLowerCase();
  return words.some((word) => new RegExp(`(^|[^a-z0-9])${word}([^a-z0-9]|$)`, "u").test(normalized));
}
function nonChatByName(id) {
  const value = id.toLowerCase();
  if (hasWord(value, ["image", "images", "imagen"]) || includesAny(value, ["dall-e", "dalle", "midjourney", "mj_", "stable-diffusion", "flux", "ideogram", "recraft", "kolors", "seedream"])) return true;
  if (hasWord(value, ["video", "sora", "veo", "kling", "hailuo", "vidu", "luma", "runway", "pixverse"]) || includesAny(value, ["seedance", "wanx"])) return true;
  if (hasWord(value, ["tts", "stt", "whisper", "audio", "speech", "voice", "suno", "realtime", "music"])) {
    return true;
  }
  if (includesAny(value, ["embed", "text2vec", "moderation", "rerank"]) || hasWord(value, ["bge", "m3e", "ada", "curie", "babbage", "davinci"])) return true;
  return false;
}
function isChatPricingModel(row) {
  const id = textOf(row.model_name);
  if (id === "" || nonChatByName(id)) return false;
  const modelType = textOf(row.model_type);
  if (isChatModelType(modelType)) return true;
  if (includesAny(modelType, ["\u56FE\u50CF", "\u7ED8\u753B", "image", "\u89C6\u9891", "video", "\u97F3\u9891", "\u8BED\u97F3", "audio", "tts", "stt", "\u97F3\u4E50", "\u5411\u91CF", "embed", "\u68C0\u7D22", "rerank"])) {
    return false;
  }
  const endpoints = Array.isArray(row.supported_endpoint_types) ? row.supported_endpoint_types.filter((value) => typeof value === "string").join(",") : "";
  if (includesAny(endpoints, ["image-generation", "\u6587\u751F\u56FE", "\u56FE\u751F\u56FE", "\u751F\u56FE", "\u7ED8\u753B", "video", "\u89C6\u9891", "tts", "stt", "audio", "speech", "\u8BED\u97F3", "embedding", "rerank"])) {
    return false;
  }
  const tags = textOf(row.tags);
  if (includesAny(tags, ["\u6587\u751F\u56FE", "\u56FE\u751F\u56FE", "\u751F\u56FE", "\u7ED8\u753B", "\u6587\u751F\u89C6\u9891", "\u56FE\u751F\u89C6\u9891", "\u6587\u672C\u8F6C\u8BED\u97F3", "\u8F6C\u5F55", "\u97F3\u4E50", "\u5411\u91CF", "\u5D4C\u5165", "\u91CD\u6392"])) {
    return false;
  }
  return true;
}
async function callableIds(ctx2, baseUrl, apiKey, signal) {
  const key = `${normalizeBase(baseUrl)}|${tokenDigest(apiKey)}`;
  const cached = callableCache.get(key);
  if (cached !== void 0 && Date.now() - cached.at < CALLABLE_CACHE_TTL_MS) {
    callableCache.delete(key);
    callableCache.set(key, cached);
    return new Set(cached.value);
  }
  const existing = callableFlights.get(key);
  if (existing !== void 0) return existing;
  const flight = (async () => {
    const { response, body } = await requestJson(
      ctx2,
      `${normalizeBase(baseUrl)}/v1/models`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
      ACCOUNT_TIMEOUT_MS,
      signal
    );
    if (!response.ok) return void 0;
    const rows = body?.data;
    if (!Array.isArray(rows)) return void 0;
    const ids = /* @__PURE__ */ new Set();
    for (const row of rows) {
      const id = textOf(row?.id);
      if (id !== "") ids.add(id);
    }
    if (ids.size === 0) return void 0;
    callableCache.set(key, { at: Date.now(), value: ids });
    while (callableCache.size > MAX_TOKEN_CACHE_ENTRIES) {
      const oldest = callableCache.keys().next().value;
      if (oldest === void 0) break;
      callableCache.delete(oldest);
    }
    return new Set(ids);
  })().finally(() => callableFlights.delete(key));
  callableFlights.set(key, flight);
  return flight;
}
async function listedChatModels(ctx2, baseUrl, signal) {
  const key = normalizeBase(baseUrl);
  const cached = squareCache.get(key);
  if (cached !== void 0 && Date.now() - cached.at < SQUARE_CACHE_TTL_MS) {
    return cached.value.map((model) => ({ ...model }));
  }
  const existing = squareFlights.get(key);
  if (existing !== void 0) return existing;
  const flight = (async () => {
    const { response, body } = await requestJson(
      ctx2,
      `${key}/api/pricing`,
      { method: "GET" },
      ACCOUNT_TIMEOUT_MS,
      signal
    );
    if (!response.ok) return void 0;
    const rows = body?.data;
    if (!Array.isArray(rows)) return void 0;
    const models = [];
    for (const row of rows) {
      const id = textOf(row?.model_name);
      if (id === "" || !isChatPricingModel(row)) continue;
      const tags = textOf(row?.tags);
      models.push({ id, ...tags === "" ? {} : { tags } });
    }
    if (models.length === 0) return void 0;
    squareCache.set(key, { at: Date.now(), value: models });
    return models.map((model) => ({ ...model }));
  })().finally(() => squareFlights.delete(key));
  squareFlights.set(key, flight);
  return flight;
}
async function fetchChatPool(ctx2, baseUrl, apiKey, signal) {
  const [callable, listed] = await Promise.all([
    callableIds(ctx2, baseUrl, apiKey, signal),
    listedChatModels(ctx2, baseUrl, signal)
  ]);
  if (callable === void 0 || listed === void 0) return void 0;
  const pool = listed.filter((model) => callable.has(model.id));
  return pool.length > 0 ? pool : void 0;
}

// echoflowai-tools/src/models/sync.ts
var PI_AI_NS = settingsNamespace("llm-pi-ai");
var DEFAULT_NS = settingsNamespace("agent-default-model");
var ROUTE = "openlux";
function selectionOf(value) {
  const section = value;
  return {
    ...typeof section?.provider === "string" ? { provider: section.provider } : {},
    ...typeof section?.model === "string" && section.model !== "" ? { model: section.model } : {}
  };
}
async function applyDefaultModel(settings2, delivery, models) {
  if (delivery?.configured !== true) return false;
  const first = models.find(isManaged)?.id;
  if (first === void 0) return false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const descriptor = settings2.describe().find((entry) => entry.ns === DEFAULT_NS);
    const written = selectionOf(descriptor?.user);
    if (written.model !== void 0) {
      if (written.provider !== ROUTE) return false;
      if (models.some((entry) => entry.id === written.model)) return false;
    }
    const resolved = selectionOf(settings2.get(DEFAULT_NS));
    if (resolved.provider === ROUTE && resolved.model === first) return false;
    try {
      await settings2.mutate(DEFAULT_NS, [
        { op: "set", path: ["provider"], value: ROUTE },
        { op: "set", path: ["model"], value: first },
        // The effort was chosen for the model being left behind. Levels are
        // declared per model (`reasoningEfforts`), so carrying one across is at
        // best meaningless and at worst a level the next model does not have.
        { op: "unset", path: ["reasoningEffort"] }
      ], descriptor?.revision);
      return true;
    } catch (error) {
      if (!(error instanceof SettingsConflictError) || attempt > 0) throw error;
    }
  }
  return false;
}
function modelsOf(section) {
  const models = section?.providers?.[ROUTE]?.models;
  if (!Array.isArray(models)) return void 0;
  return models.filter((entry) => typeof entry?.id === "string" && entry.id !== "");
}
function currentModels(settings2) {
  return modelsOf(settings2.get(PI_AI_NS)) ?? [];
}
function writtenModels(settings2) {
  const descriptor = settings2.describe().find((entry) => entry.ns === PI_AI_NS);
  return modelsOf(descriptor?.user) ?? [];
}
var OVERRIDDEN_FIELDS = /* @__PURE__ */ new Set(["input", "name", "contextWindow", "maxTokens"]);
function described(entry, overrides, snapshotPresent, resetOverridden = false) {
  const override = overrides.get(entry.id);
  const next = resetOverridden ? Object.fromEntries(Object.entries(entry).filter(([key]) => !OVERRIDDEN_FIELDS.has(key))) : { ...entry };
  if (override !== void 0) {
    if (override.input !== void 0) next["input"] = [...override.input];
    if (override.name !== void 0) next["name"] = override.name;
    if (override.contextWindow !== void 0) next["contextWindow"] = override.contextWindow;
    if (override.maxTokens !== void 0) next["maxTokens"] = override.maxTokens;
  }
  const thinking = override?.thinking;
  if (thinking !== void 0 && Object.keys(thinking.efforts).length > 0) {
    next["reasoningEfforts"] = { ...thinking.efforts };
    const compat = {};
    if (thinking.format !== void 0) compat["thinkingFormat"] = thinking.format;
    if (thinking.supportsReasoningEffort !== void 0) {
      compat["supportsReasoningEffort"] = thinking.supportsReasoningEffort;
    }
    if (Object.keys(compat).length === 0) delete next["compat"];
    else next["compat"] = compat;
  } else if (thinking !== void 0 || snapshotPresent) {
    delete next["reasoningEfforts"];
    delete next["compat"];
  }
  return next;
}
function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
async function syncModels(ctx2, options, signal, control = {}) {
  const settings2 = ctx2.get("settings");
  if (settings2 === void 0) return { changed: false, skipped: "no-settings" };
  const apiKey = await options.model.apiKey();
  const hasKey = apiKey !== void 0 && apiKey !== "";
  if (!hasKey) return { changed: false, skipped: "no-key" };
  const [deliveryResult, overrideResult, poolResult] = await Promise.allSettled([
    fetchDeliveredModelConfig(options.config, signal),
    fetchModelOverrides(options.config, signal),
    fetchChatPool(ctx2, options.model.baseUrl, apiKey, signal)
  ]);
  signal?.throwIfAborted();
  const delivery = deliveryResult.status === "fulfilled" ? deliveryResult.value : void 0;
  const overrideSnapshot = overrideResult.status === "fulfilled" ? overrideResult.value : void 0;
  const pool = poolResult.status === "fulfilled" ? poolResult.value : void 0;
  if (deliveryResult.status === "rejected") {
    ctx2.logger.warn(`openlux: model delivery unavailable; preserving local defaults (${errorText(deliveryResult.reason)})`);
  }
  if (overrideResult.status === "rejected") {
    ctx2.logger.warn(`openlux: model capability overrides unavailable; preserving the last confirmed answer (${errorText(overrideResult.reason)})`);
  }
  if (poolResult.status === "rejected") {
    ctx2.logger.warn(`openlux: token model directory unavailable; preserving the last usable list (${errorText(poolResult.reason)})`);
  }
  const reportedDelivery = delivery === void 0 ? {} : { delivery };
  if (pool === void 0) {
    return { changed: false, skipped: "no-pool", ...reportedDelivery };
  }
  const available = new Set(pool.map((model) => model.id));
  let ids;
  let source;
  if (delivery !== void 0) {
    const intended = delivery.chatModels.length > 0 ? delivery.chatModels : FALLBACK_MODELS;
    ids = intended.filter((id) => available.has(id));
    source = delivery.chatModels.length > 0 ? "console" : "square";
  } else {
    ids = deliveredIds(pool);
    source = "square";
  }
  if (ids.length === 0) {
    return { changed: false, skipped: "empty-result", source, ...reportedDelivery };
  }
  const overrides = overrideSnapshot?.overrides ?? /* @__PURE__ */ new Map();
  const buildNext = () => {
    const current = currentModels(settings2);
    const written = writtenModels(settings2);
    const merged = merge(ids, written.filter((entry) => !isManaged(entry)));
    const previous = overrideSnapshot === void 0 ? new Map(current.filter(isManaged).map((entry) => [entry.id, entry])) : /* @__PURE__ */ new Map();
    const membership = merged.map((entry) => isManaged(entry) ? previous.get(entry.id) ?? entry : entry);
    return membership.map((entry) => described(
      entry,
      overrides,
      overrideSnapshot !== void 0,
      overrideSnapshot !== void 0 && isManaged(entry)
    ));
  };
  const prepared = buildNext();
  if (control.commit === false) {
    return {
      changed: false,
      skipped: "prepared",
      source,
      models: prepared.length,
      managed: prepared.filter(isManaged).length,
      kept: prepared.filter((entry) => !isManaged(entry)).length,
      ...reportedDelivery
    };
  }
  const serializeWrite = control.serializeWrite ?? (async (task) => task());
  return serializeWrite(async () => {
    signal?.throwIfAborted();
    if (await control.canCommit?.() === false) {
      return { changed: false, skipped: "stale", source, ...reportedDelivery };
    }
    let next = prepared;
    let listChanged = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      signal?.throwIfAborted();
      if (await control.canCommit?.() === false) {
        return { changed: false, skipped: "stale", source, ...reportedDelivery };
      }
      const descriptor = settings2.describe().find((entry) => entry.ns === PI_AI_NS);
      const current = currentModels(settings2);
      next = buildNext();
      listChanged = !same(current, next);
      if (!listChanged) break;
      try {
        await settings2.mutate(
          PI_AI_NS,
          [{ op: "set", path: ["providers", ROUTE, "models"], value: next }],
          descriptor?.revision
        );
        break;
      } catch (error) {
        if (!(error instanceof SettingsConflictError) || attempt > 0) throw error;
      }
    }
    let defaultChanged = false;
    try {
      defaultChanged = await applyDefaultModel(settings2, delivery, next);
    } catch (error) {
      ctx2.logger.warn(`openlux: default model could not be aligned with the delivered list (${errorText(error)})`);
    }
    if (!listChanged) {
      return {
        changed: defaultChanged,
        skipped: "unchanged",
        models: next.length,
        source,
        ...reportedDelivery
      };
    }
    return {
      changed: true,
      source,
      models: next.length,
      managed: next.filter(isManaged).length,
      kept: next.filter((entry) => !isManaged(entry)).length,
      described: next.filter((entry) => entry["reasoningEfforts"] !== void 0).length,
      overridden: next.filter((entry) => overrides.has(entry.id)).length,
      ...reportedDelivery
    };
  });
}
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

// echoflowai-tools/src/models/_local_capability_check.ts
var PI_AI_NS2 = settingsNamespace("llm-pi-ai");
var DEFAULT_NS2 = settingsNamespace("agent-default-model");
var QWEN_OPTIONAL = { efforts: { off: null, high: "high" }, format: "qwen" };
var capabilityItems = [
  {
    model_name: "m-think",
    provider_scope: "yunwu",
    category: "chat",
    input: ["text", "image"],
    thinking: QWEN_OPTIONAL,
    name: "Thinker",
    context_window: 2e5,
    max_output_tokens: 16384,
    updated_at: 1
  },
  // 思考 JSON 坏（未知档位）：丢那一格，收图声明照收。
  {
    model_name: "m-badlevel",
    provider_scope: "yunwu",
    category: "chat",
    input: ["text"],
    thinking: { efforts: { turbo: "turbo" } },
    updated_at: 2
  },
  // 明确不思考。
  { model_name: "deepseek-v4-flash", provider_scope: "yunwu", category: "chat", thinking: { efforts: {} }, updated_at: 3 },
  // 只剩 off 不成立 → 整行没有可用声明 → 不进 map。
  { model_name: "m-offonly", provider_scope: "yunwu", category: "chat", thinking: { efforts: { off: null } }, updated_at: 4 },
  // 方言不在内核分支里 → 丢格 → 整行空 → 不进 map。
  { model_name: "m-badformat", provider_scope: "yunwu", category: "chat", thinking: { efforts: { high: "high" }, format: "klingon" }, updated_at: 5 },
  // 三个手填格全非法 → 全丢 → 不进 map。
  { model_name: "m-badnumbers", provider_scope: "yunwu", category: "chat", name: "   ", context_window: 0, max_output_tokens: 8.5, updated_at: 6 },
  // 别人的作用域 / 非对话类：整行跳过。
  { model_name: "m-foreign", provider_scope: "cm-abc", category: "chat", input: ["text"], updated_at: 7 },
  { model_name: "m-image", provider_scope: "yunwu", category: "image", input: ["text"], updated_at: 8 },
  // 用户手加的行也吃控制台声明（保存即同步修的就是这个症状）。
  { model_name: "user-y", provider_scope: "yunwu", category: "chat", thinking: QWEN_OPTIONAL, updated_at: 9 }
];
var chatIds = ["m-think", "m-plain", "deepseek-v4-flash"];
var poolIds = [...chatIds, "user-x", "user-y"];
var state = {
  configFail: false,
  items: capabilityItems
};
function jsonResponse(body) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
globalThis.fetch = (async (input) => {
  const url = String(input);
  if (url.includes("/api/desktop-config/model-delivery")) {
    return jsonResponse({ success: true, data: { configured: true, revision: 9, chat_models: chatIds, search_models: [] } });
  }
  if (url.includes("/api/desktop-config")) {
    if (state.configFail) return new Response("boom", { status: 500 });
    return jsonResponse({ success: true, data: { modelCapabilities: { rollout: { enabled: true }, items: state.items } } });
  }
  if (url.includes("/v1/models")) {
    return jsonResponse({ data: poolIds.map((id) => ({ id })) });
  }
  if (url.includes("/api/pricing")) {
    return jsonResponse({ data: poolIds.map((id) => ({ model_name: id })) });
  }
  throw new Error(`unexpected fetch: ${url}`);
});
var docs = {
  piai: {
    providers: {
      openlux: {
        models: [
          // user-x 带着 v3 目录时代写上的陈旧思考声明：控制台可达且没点名它，
          // 声明必须被剥掉；手敲的窗口值必须留下。
          {
            id: "user-x",
            contextWindow: 4096,
            reasoningEfforts: { high: "high" },
            compat: { thinkingFormat: "openai" }
          },
          { id: "user-y" }
        ]
      }
    }
  },
  def: {}
};
var settings = {
  get(ns) {
    return ns === PI_AI_NS2 ? docs.piai : ns === DEFAULT_NS2 ? docs.def : void 0;
  },
  describe() {
    return [
      { ns: PI_AI_NS2, user: docs.piai, revision: 1 },
      { ns: DEFAULT_NS2, user: docs.def, revision: 1 }
    ];
  },
  async mutate(ns, ops) {
    for (const op of ops) {
      if (ns === PI_AI_NS2 && op.op === "set" && op.path.join(".") === "providers.openlux.models") {
        docs.piai = { providers: { openlux: { models: op.value } } };
      } else if (ns === DEFAULT_NS2) {
        if (op.op === "set") docs.def[op.path[0]] = op.value;
        else delete docs.def[op.path[0]];
      }
    }
  }
};
var ctx = {
  get: (name) => name === "settings" ? settings : void 0,
  logger: { debug() {
  }, info() {
  }, warn() {
  }, error() {
  } }
};
var access = {
  baseUrl: "http://stub.local",
  apiKey: async () => "sk-test"
};
function modelsById() {
  const models = docs.piai.providers?.["openlux"]?.models ?? [];
  return new Map(models.map((entry) => [entry.id, entry]));
}
async function main() {
  const snapshot = await fetchModelOverrides(access);
  import_strict.default.equal(snapshot.enabled, true);
  const o = snapshot.overrides;
  import_strict.default.deepEqual(o.get("m-think"), {
    input: ["text", "image"],
    thinking: { efforts: { off: null, high: "high" }, format: "qwen" },
    name: "Thinker",
    contextWindow: 2e5,
    maxTokens: 16384
  });
  import_strict.default.deepEqual(o.get("m-badlevel"), { input: ["text"] }, "\u574F\u601D\u8003\u683C\u53EA\u4E22\u683C\uFF0C\u6536\u56FE\u683C\u7167\u6536");
  import_strict.default.deepEqual(o.get("deepseek-v4-flash"), { thinking: { efforts: {} } });
  import_strict.default.deepEqual(o.get("user-y"), { thinking: { efforts: { off: null, high: "high" }, format: "qwen" } });
  import_strict.default.equal(o.has("m-offonly"), false, "\u53EA\u5269 off \u7684\u58F0\u660E\u6574\u683C\u4E22\u5F03");
  import_strict.default.equal(o.has("m-badformat"), false, "\u672A\u77E5\u65B9\u8A00\u6574\u683C\u4E22\u5F03");
  import_strict.default.equal(o.has("m-badnumbers"), false, "\u4E09\u4E2A\u624B\u586B\u683C\u5168\u975E\u6CD5\u5219\u6574\u884C\u65E0\u58F0\u660E");
  import_strict.default.equal(o.has("m-foreign"), false);
  import_strict.default.equal(o.has("m-image"), false);
  const outcome = await syncModels(ctx, { model: access, config: access });
  import_strict.default.equal(outcome.changed, true);
  let byId = modelsById();
  import_strict.default.deepEqual([...byId.keys()], ["m-think", "m-plain", "deepseek-v4-flash", "user-x", "user-y"]);
  const think = byId.get("m-think");
  import_strict.default.deepEqual(think["reasoningEfforts"], { off: null, high: "high" });
  import_strict.default.deepEqual(think["compat"], { thinkingFormat: "qwen" });
  import_strict.default.equal(think["name"], "Thinker");
  import_strict.default.equal(think["contextWindow"], 2e5);
  import_strict.default.equal(think["maxTokens"], 16384);
  import_strict.default.deepEqual(think["input"], ["text", "image"]);
  import_strict.default.equal(think[MANAGED_FLAG], true);
  const flash = byId.get("deepseek-v4-flash");
  import_strict.default.equal(flash["reasoningEfforts"], void 0, '{"efforts":{}} \u5220\u58F0\u660E');
  import_strict.default.equal(flash["compat"], void 0);
  const plain = byId.get("m-plain");
  import_strict.default.equal(plain["reasoningEfforts"], void 0);
  import_strict.default.equal(plain["name"], void 0);
  import_strict.default.equal(plain["contextWindow"], void 0);
  const userX = byId.get("user-x");
  import_strict.default.equal(userX["contextWindow"], 4096);
  import_strict.default.equal(userX["reasoningEfforts"], void 0, "\u76EE\u5F55\u65F6\u4EE3\u7684\u9648\u65E7\u58F0\u660E\u88AB\u53EF\u8FBE\u63A7\u5236\u53F0\u5265\u6389");
  import_strict.default.equal(userX["compat"], void 0);
  import_strict.default.equal(userX[MANAGED_FLAG], void 0);
  const userY = byId.get("user-y");
  import_strict.default.deepEqual(userY["reasoningEfforts"], { off: null, high: "high" });
  import_strict.default.deepEqual(userY["compat"], { thinkingFormat: "qwen" });
  import_strict.default.equal(userY[MANAGED_FLAG], void 0);
  import_strict.default.equal(docs.def.provider, "openlux");
  import_strict.default.equal(docs.def.model, "m-think");
  state.configFail = true;
  const outcome2 = await syncModels(ctx, { model: access, config: access });
  import_strict.default.equal(outcome2.changed, false, "\u4E0D\u53EF\u8FBE\u8F6E\u4E0D\u5199");
  import_strict.default.equal(outcome2.skipped, "unchanged");
  byId = modelsById();
  import_strict.default.deepEqual(byId.get("m-think")["reasoningEfforts"], { off: null, high: "high" }, "\u58F0\u660E\u4FDD\u6301\u4E0A\u4E00\u8F6E\u7684\u503C");
  import_strict.default.equal(byId.get("m-think")["name"], "Thinker");
  import_strict.default.deepEqual(byId.get("user-y")["reasoningEfforts"], { off: null, high: "high" });
  state.configFail = false;
  state.items = capabilityItems.filter((item) => item.model_name !== "m-think" && item.model_name !== "user-y");
  const outcome3 = await syncModels(ctx, { model: access, config: access });
  import_strict.default.equal(outcome3.changed, true);
  byId = modelsById();
  const thinkBare = byId.get("m-think");
  import_strict.default.equal(thinkBare["reasoningEfforts"], void 0, "\u5220\u884C\u540E\u601D\u8003\u58F0\u660E\u5265\u9664");
  import_strict.default.equal(thinkBare["compat"], void 0);
  import_strict.default.equal(thinkBare["name"], void 0, "\u5220\u884C\u540E OVERRIDDEN_FIELDS \u91CD\u7F6E");
  import_strict.default.equal(thinkBare["contextWindow"], void 0);
  import_strict.default.equal(thinkBare["maxTokens"], void 0);
  import_strict.default.equal(thinkBare["input"], void 0);
  import_strict.default.equal(thinkBare[MANAGED_FLAG], true);
  const userYBare = byId.get("user-y");
  import_strict.default.equal(userYBare["reasoningEfforts"], void 0);
  import_strict.default.equal(byId.get("user-x")["contextWindow"], 4096, "\u7528\u6237\u624B\u6572\u503C\u4E0D\u968F\u63A7\u5236\u53F0\u884C\u8D70");
  console.log("capability check: all assertions passed");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
