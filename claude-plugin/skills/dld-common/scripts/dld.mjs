#!/usr/bin/env node
import { createRequire as __dldCreateRequire } from "node:module";
const require = __dldCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
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

// node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  "node_modules/yaml/dist/nodes/identity.js"(exports) {
    "use strict";
    var ALIAS = /* @__PURE__ */ Symbol.for("yaml.alias");
    var DOC = /* @__PURE__ */ Symbol.for("yaml.document");
    var MAP = /* @__PURE__ */ Symbol.for("yaml.map");
    var PAIR = /* @__PURE__ */ Symbol.for("yaml.pair");
    var SCALAR = /* @__PURE__ */ Symbol.for("yaml.scalar");
    var SEQ = /* @__PURE__ */ Symbol.for("yaml.seq");
    var NODE_TYPE = /* @__PURE__ */ Symbol.for("yaml.node.type");
    var isAlias = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === DOC;
    var isMap2 = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === PAIR;
    var isScalar = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === "object" && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === "object")
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap2;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar;
    exports.isSeq = isSeq;
  }
});

// node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  "node_modules/yaml/dist/visit.js"(exports) {
    "use strict";
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove node");
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path) {
      const ctrl = callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visit_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = visit_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = visit_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE)
          node.contents = null;
      } else
        await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path) {
      const ctrl = await callVisitor(key, node, visitor, path);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path, ctrl);
        return visitAsync_(key, ctrl, visitor, path);
      }
      if (typeof ctrl !== "symbol") {
        if (identity.isCollection(node)) {
          path = Object.freeze(path.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path = Object.freeze(path.concat(node));
          const ck = await visitAsync_("key", node.key, visitor, path);
          if (ck === BREAK)
            return BREAK;
          else if (ck === REMOVE)
            node.key = null;
          const cv = await visitAsync_("value", node.value, visitor, path);
          if (cv === BREAK)
            return BREAK;
          else if (cv === REMOVE)
            node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === "object" && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign({
          Alias: visitor.Node,
          Map: visitor.Node,
          Scalar: visitor.Node,
          Seq: visitor.Node
        }, visitor.Value && {
          Map: visitor.Value,
          Scalar: visitor.Value,
          Seq: visitor.Value
        }, visitor.Collection && {
          Map: visitor.Collection,
          Seq: visitor.Collection
        }, visitor);
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path) {
      if (typeof visitor === "function")
        return visitor(key, node, path);
      if (identity.isMap(node))
        return visitor.Map?.(key, node, path);
      if (identity.isSeq(node))
        return visitor.Seq?.(key, node, path);
      if (identity.isPair(node))
        return visitor.Pair?.(key, node, path);
      if (identity.isScalar(node))
        return visitor.Scalar?.(key, node, path);
      if (identity.isAlias(node))
        return visitor.Alias?.(key, node, path);
      return void 0;
    }
    function replaceNode(key, path, node) {
      const parent = path[path.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === "key")
          parent.key = node;
        else
          parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? "alias" : "scalar";
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  }
});

// node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  "node_modules/yaml/dist/doc/directives.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      "!": "%21",
      ",": "%2C",
      "[": "%5B",
      "]": "%5D",
      "{": "%7B",
      "}": "%7D"
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case "1.1":
            this.atNextDocument = true;
            break;
          case "1.2":
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: "1.2"
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: "1.1" };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case "%TAG": {
            if (parts.length !== 2) {
              onError(0, "%TAG directive should contain exactly two parts");
              if (parts.length < 2)
                return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case "%YAML": {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, "%YAML directive should contain exactly one part");
              return false;
            }
            const [version2] = parts;
            if (version2 === "1.1" || version2 === "1.2") {
              this.yaml.version = version2;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version2);
              onError(6, `Unsupported YAML version ${version2}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === "!")
          return "!";
        if (source[0] !== "!") {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === "<") {
          const verbatim = source.slice(2, -1);
          if (verbatim === "!" || verbatim === "!!") {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== ">")
            onError("Verbatim tags must end with a >");
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix)
          onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === "!")
          return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix))
            return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === "!" ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || "1.2"}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag)
              tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else
          tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === "!!" && prefix === "tag:yaml.org,2002:")
            continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix)))
            lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join("\n");
      }
    };
    Directives.defaultYaml = { explicit: false, version: "1.2" };
    Directives.defaultTags = { "!!": "tag:yaml.org,2002:" };
    exports.Directives = Directives;
  }
});

// node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  "node_modules/yaml/dist/doc/anchors.js"(exports) {
    "use strict";
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor)
            anchors.add(node.anchor);
        }
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name))
          return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (typeof ref === "object" && ref.anchor && (identity.isScalar(ref.node) || identity.isCollection(ref.node))) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error("Failed to resolve repeated object (this should not happen)");
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  }
});

// node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  "node_modules/yaml/dist/doc/applyReviver.js"(exports) {
    "use strict";
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === "object") {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0)
              delete val[i];
            else if (v1 !== v0)
              val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              val.delete(k);
            else if (v1 !== v0)
              val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0)
              val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0)
              delete val[k];
            else if (v1 !== v0)
              val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  }
});

// node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  "node_modules/yaml/dist/nodes/toJS.js"(exports) {
    "use strict";
    var identity = require_identity();
    function toJS(value, arg, ctx) {
      if (Array.isArray(value))
        return value.map((v, i) => toJS(v, String(i), ctx));
      if (value && typeof value.toJSON === "function") {
        if (!ctx || !identity.hasAnchor(value))
          return value.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value.toJSON(arg, ctx);
        if (ctx.onCreate)
          ctx.onCreate(res);
        return res;
      }
      if (typeof value === "bigint" && !ctx?.keep)
        return Number(value);
      return value;
    }
    exports.toJS = toJS;
  }
});

// node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  "node_modules/yaml/dist/nodes/Node.js"(exports) {
    "use strict";
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc))
          throw new TypeError("A document argument is required");
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this, "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  }
});

// node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  "node_modules/yaml/dist/nodes/Alias.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, "tag", {
          set() {
            throw new Error("Alias nodes cannot have tags");
          }
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0)
          throw new ReferenceError("Alias resolution is disabled");
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node))
                nodes.push(node);
            }
          });
          if (ctx)
            ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this)
            break;
          if (node.anchor === this.source)
            found = node;
        }
        if (found && ctx) {
          const { anchors: anchors2, doc: doc2, maxAliasCount } = ctx;
          let data = anchors2.get(found);
          if (!data) {
            toJS.toJS(found, null, ctx);
            data = anchors2.get(found);
          }
          if (data?.res === void 0) {
            const msg = "This should not happen: Alias anchor was not resolved?";
            throw new ReferenceError(msg);
          }
          if (maxAliasCount >= 0) {
            data.count += 1;
            if (data.aliasCount === 0)
              data.aliasCount = getAliasCount(doc2, found, anchors2);
            if (data.count * data.aliasCount > maxAliasCount) {
              const msg = "Excessive alias count indicates a resource exhaustion attack";
              throw new ReferenceError(msg);
            }
          }
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx)
          return { source: this.source };
        const source = this.resolve(ctx.doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        return ctx.anchors.get(source).res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey)
            return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count)
            count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  }
});

// node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  "node_modules/yaml/dist/nodes/Scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value) => !value || typeof value !== "function" && typeof value !== "object";
    var Scalar = class extends Node.NodeBase {
      constructor(value) {
        super(identity.SCALAR);
        this.value = value;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = "BLOCK_FOLDED";
    Scalar.BLOCK_LITERAL = "BLOCK_LITERAL";
    Scalar.PLAIN = "PLAIN";
    Scalar.QUOTE_DOUBLE = "QUOTE_DOUBLE";
    Scalar.QUOTE_SINGLE = "QUOTE_SINGLE";
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  }
});

// node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  "node_modules/yaml/dist/doc/createNode.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = "tag:yaml.org,2002:";
    function findTagObject(value, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj)
          throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value) && !t.format);
    }
    function createNode(value, tagName, ctx) {
      if (identity.isDocument(value))
        value = value.contents;
      if (identity.isNode(value))
        return value;
      if (identity.isPair(value)) {
        const map = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map.items.push(value);
        return map;
      }
      if (value instanceof String || value instanceof Number || value instanceof Boolean || typeof BigInt !== "undefined" && value instanceof BigInt) {
        value = value.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value && typeof value === "object") {
        ref = sourceObjects.get(value);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value, ref);
        }
      }
      if (tagName?.startsWith("!!"))
        tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value, tagName, schema.tags);
      if (!tagObj) {
        if (value && typeof value.toJSON === "function") {
          value = value.toJSON();
        }
        if (!value || typeof value !== "object") {
          const node2 = new Scalar.Scalar(value);
          if (ref)
            ref.node = node2;
          return node2;
        }
        tagObj = value instanceof Map ? schema[identity.MAP] : Symbol.iterator in Object(value) ? schema[identity.SEQ] : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode ? tagObj.createNode(ctx.schema, value, ctx) : typeof tagObj?.nodeClass?.from === "function" ? tagObj.nodeClass.from(ctx.schema, value, ctx) : new Scalar.Scalar(value);
      if (tagName)
        node.tag = tagName;
      else if (!tagObj.default)
        node.tag = tagObj.tag;
      if (ref)
        ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  }
});

// node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  "node_modules/yaml/dist/nodes/Collection.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path, value) {
      let v = value;
      for (let i = path.length - 1; i >= 0; --i) {
        const k = path[i];
        if (typeof k === "number" && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error("This should not happen, please report a bug.");
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map()
      });
    }
    var isEmptyPath = (path) => path == null || typeof path === "object" && !!path[Symbol.iterator]().next().done;
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, "schema", {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema)
          copy.schema = schema;
        copy.items = copy.items.map((it) => identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it);
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path, value) {
        if (isEmptyPath(path))
          this.add(value);
        else {
          const [key, ...rest] = path;
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.addIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node))
          return node.deleteIn(rest);
        else
          throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        const [key, ...rest] = path;
        const node = this.get(key, true);
        if (rest.length === 0)
          return !keepScalar && identity.isScalar(node) ? node.value : node;
        else
          return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node))
            return false;
          const n = node.value;
          return n == null || allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag;
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path) {
        const [key, ...rest] = path;
        if (rest.length === 0)
          return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        const [key, ...rest] = path;
        if (rest.length === 0) {
          this.set(key, value);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node))
            node.setIn(rest, value);
          else if (node === void 0 && this.schema)
            this.set(key, collectionFromPath(this.schema, rest, value));
          else
            throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  }
});

// node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyComment.js"(exports) {
    "use strict";
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, "#");
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment))
        return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) => str.endsWith("\n") ? indentComment(comment, indent) : comment.includes("\n") ? "\n" + indentComment(comment, indent) : (str.endsWith(" ") ? "" : " ") + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  }
});

// node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  "node_modules/yaml/dist/stringify/foldFlowLines.js"(exports) {
    "use strict";
    var FOLD_FLOW = "flow";
    var FOLD_BLOCK = "block";
    var FOLD_QUOTED = "quoted";
    function foldFlowLines(text, indent, mode = "flow", { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {}) {
      if (!lineWidth || lineWidth < 0)
        return text;
      if (lineWidth < minContentWidth)
        minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep)
        return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === "number") {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth))
          folds.push(0);
        else
          end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1)
          end = i + endStep;
      }
      for (let ch; ch = text[i += 1]; ) {
        if (mode === FOLD_QUOTED && ch === "\\") {
          escStart = i;
          switch (text[i + 1]) {
            case "x":
              i += 3;
              break;
            case "u":
              i += 5;
              break;
            case "U":
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === "\n") {
          if (mode === FOLD_BLOCK)
            i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === " " && prev && prev !== " " && prev !== "\n" && prev !== "	") {
            const next = text[i + 1];
            if (next && next !== " " && next !== "\n" && next !== "	")
              split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === " " || prev === "	") {
                prev = ch;
                ch = text[i += 1];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j])
                return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow)
        onOverflow();
      if (folds.length === 0)
        return text;
      if (onFold)
        onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold])
            res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === " " || ch === "	") {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== "\n");
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  }
});

// node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyString.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0)
        return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit)
        return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === "\n") {
          if (i - start > limit)
            return true;
          start = i + 1;
          if (strLen - start <= limit)
            return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value, ctx) {
      const json = JSON.stringify(value);
      if (ctx.options.doubleQuotedAsJSON)
        return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      let str = "";
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === " " && json[i + 1] === "\\" && json[i + 2] === "n") {
          str += json.slice(start, i) + "\\ ";
          i += 1;
          start = i;
          ch = "\\";
        }
        if (ch === "\\")
          switch (json[i + 1]) {
            case "u":
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case "0000":
                    str += "\\0";
                    break;
                  case "0007":
                    str += "\\a";
                    break;
                  case "000b":
                    str += "\\v";
                    break;
                  case "001b":
                    str += "\\e";
                    break;
                  case "0085":
                    str += "\\N";
                    break;
                  case "00a0":
                    str += "\\_";
                    break;
                  case "2028":
                    str += "\\L";
                    break;
                  case "2029":
                    str += "\\P";
                    break;
                  default:
                    if (code.substr(0, 2) === "00")
                      str += "\\x" + code.substr(2);
                    else
                      str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case "n":
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + "\n\n";
                while (json[i + 2] === "\\" && json[i + 3] === "n" && json[i + 4] !== '"') {
                  str += "\n";
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === " ")
                  str += "\\";
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value, ctx) {
      if (ctx.options.singleQuote === false || ctx.implicitKey && value.includes("\n") || /[ \t]\n|\n[ \t]/.test(value))
        return doubleQuotedString(value, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value) ? "  " : "");
      const res = "'" + value.replace(/'/g, "''").replace(/\n+/g, `$&
${indent}`) + "'";
      return ctx.implicitKey ? res : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false)
        qs = doubleQuotedString;
      else {
        const hasDouble = value.includes('"');
        const hasSingle = value.includes("'");
        if (hasDouble && !hasSingle)
          qs = singleQuotedString;
        else if (hasSingle && !hasDouble)
          qs = doubleQuotedString;
        else
          qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp("(^|(?<!\n))\n+(?!\n|$)", "g");
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value)) {
        return quotedString(value, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value) ? "  " : "");
      const literal = blockQuote === "literal" ? true : blockQuote === "folded" || type === Scalar.Scalar.BLOCK_FOLDED ? false : type === Scalar.Scalar.BLOCK_LITERAL ? true : !lineLengthOverLimit(value, lineWidth, indent.length);
      if (!value)
        return literal ? "|\n" : ">\n";
      let chomp;
      let endStart;
      for (endStart = value.length; endStart > 0; --endStart) {
        const ch = value[endStart - 1];
        if (ch !== "\n" && ch !== "	" && ch !== " ")
          break;
      }
      let end = value.substring(endStart);
      const endNlPos = end.indexOf("\n");
      if (endNlPos === -1) {
        chomp = "-";
      } else if (value === end || endNlPos !== end.length - 1) {
        chomp = "+";
        if (onChompKeep)
          onChompKeep();
      } else {
        chomp = "";
      }
      if (end) {
        value = value.slice(0, -end.length);
        if (end[end.length - 1] === "\n")
          end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value.length; ++startEnd) {
        const ch = value[startEnd];
        if (ch === " ")
          startWithSpace = true;
        else if (ch === "\n")
          startNlPos = startEnd;
        else
          break;
      }
      let start = value.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value = value.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? "2" : "1";
      let header = (startWithSpace ? indentSize : "") + chomp;
      if (comment) {
        header += " " + commentString(comment.replace(/ ?[\r\n]+/g, " "));
        if (onComment)
          onComment();
      }
      if (!literal) {
        const foldedValue = value.replace(/\n+/g, "\n$&").replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, "$1$2").replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== "folded" && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(`${start}${foldedValue}${end}`, indent, foldFlowLines.FOLD_BLOCK, foldOptions);
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value = value.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if (implicitKey && value.includes("\n") || inFlow && /[[\]{},]/.test(value)) {
        return quotedString(value, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value)) {
        return implicitKey || inFlow || !value.includes("\n") ? quotedString(value, ctx) : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value.includes("\n")) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value)) {
        if (indent === "") {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value, ctx);
        }
      }
      const str = value.replace(/\n+/g, `$&
${indent}`);
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== "tag:yaml.org,2002:str" && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test))
          return quotedString(value, ctx);
      }
      return implicitKey ? str : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === "string" ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value))
          type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = implicitKey && defaultKeyType || defaultStringType;
        res = _stringify(t);
        if (res === null)
          throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  }
});

// node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  "node_modules/yaml/dist/stringify/stringify.js"(exports) {
    "use strict";
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign({
        blockQuote: true,
        commentString: stringifyComment.stringifyComment,
        defaultKeyType: null,
        defaultStringType: "PLAIN",
        directives: null,
        doubleQuotedAsJSON: false,
        doubleQuotedMinMultiLineLength: 40,
        falseStr: "false",
        flowCollectionPadding: true,
        indentSeq: true,
        lineWidth: 80,
        minContentWidth: 20,
        nullStr: "null",
        simpleKeys: false,
        singleQuote: null,
        trailingComma: false,
        trueStr: "true",
        verifyAliasOrder: true
      }, doc.schema.toStringOptions, options);
      let inFlow;
      switch (opt.collectionStyle) {
        case "block":
          inFlow = false;
          break;
        case "flow":
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? " " : "",
        indent: "",
        indentStep: typeof opt.indent === "number" ? " ".repeat(opt.indent) : "  ",
        inFlow,
        options: opt
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0)
          return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0)
            match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? "null" : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives)
        return "";
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag)
        props.push(doc.directives.tagString(tag));
      return props.join(" ");
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item))
        return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives)
          return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases)
            ctx.resolvedAliases.add(item);
          else
            ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => tagObj = o });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0)
        ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str = typeof tagObj.stringify === "function" ? tagObj.stringify(node, ctx, onComment, onChompKeep) : identity.isScalar(node) ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep) : node.toString(ctx, onComment, onChompKeep);
      if (!props)
        return str;
      return identity.isScalar(node) || str[0] === "{" || str[0] === "[" ? `${props} ${str}` : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyPair.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value }, ctx, onComment, onChompKeep) {
      const { allNullValues, doc, indent, indentStep, options: { commentString, indentSeq, simpleKeys } } = ctx;
      let keyComment = identity.isNode(key) && key.comment || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error("With simple keys, key nodes cannot have comments");
        }
        if (identity.isCollection(key) || !identity.isNode(key) && typeof key === "object") {
          const msg = "With simple keys, collection cannot be used as a key value";
          throw new Error(msg);
        }
      }
      let explicitKey = !simpleKeys && (!key || keyComment && value == null && !ctx.inFlow || identity.isCollection(key) || (identity.isScalar(key) ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL : typeof key === "object"));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(key, ctx, () => keyCommentDone = true, () => chompKeep = true);
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys)
          throw new Error("With simple keys, single line scalar must not span more than 1024 characters");
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value == null) {
          if (keyCommentDone && onComment)
            onComment();
          return str === "" ? "?" : explicitKey ? `? ${str}` : str;
        }
      } else if (allNullValues && !simpleKeys || value == null && explicitKey) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep)
          onChompKeep();
        return str;
      }
      if (keyCommentDone)
        keyComment = null;
      if (explicitKey) {
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment)
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value)) {
        vsb = !!value.spaceBefore;
        vcb = value.commentBefore;
        valueComment = value.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value && typeof value === "object")
          value = doc.createNode(value);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value))
        ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (!indentSeq && indentStep.length >= 2 && !ctx.inFlow && !explicitKey && identity.isSeq(value) && !value.flow && !value.tag && !value.anchor) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(value, ctx, () => valueCommentDone = true, () => chompKeep = true);
      let ws = " ";
      if (keyComment || vsb || vcb) {
        ws = vsb ? "\n" : "";
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === "" && !ctx.inFlow) {
          if (ws === "\n" && valueComment)
            ws = "\n\n";
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf("\n");
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value.flow ?? value.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === "&" || vs0 === "!")) {
            let sp0 = valueStr.indexOf(" ");
            if (vs0 === "&" && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === "!") {
              sp0 = valueStr.indexOf(" ", sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0)
              hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === "" || valueStr[0] === "\n") {
        ws = "";
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment)
          onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  }
});

// node_modules/yaml/dist/log.js
var require_log = __commonJS({
  "node_modules/yaml/dist/log.js"(exports) {
    "use strict";
    var node_process = __require("process");
    function debug(logLevel, ...messages) {
      if (logLevel === "debug")
        console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === "debug" || logLevel === "warn") {
        if (typeof node_process.emitWarning === "function")
          node_process.emitWarning(warning);
        else
          console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/merge.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = "<<";
    var merge = {
      identify: (value) => value === MERGE_KEY || typeof value === "symbol" && value.description === MERGE_KEY,
      default: "key",
      tag: "tag:yaml.org,2002:merge",
      test: /^<<$/,
      resolve: () => Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
        addToJSMap: addMergeToJSMap
      }),
      stringify: () => MERGE_KEY
    };
    var isMergeKey = (ctx, key) => (merge.identify(key) || identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value)) && ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (identity.isSeq(source))
        for (const it of source.items)
          mergeValue(ctx, map, it);
      else if (Array.isArray(source))
        for (const it of source)
          mergeValue(ctx, map, it);
      else
        mergeValue(ctx, map, source);
    }
    function mergeValue(ctx, map, value) {
      const source = resolveAliasValue(ctx, value);
      if (!identity.isMap(source))
        throw new Error("Merge sources must be maps or map aliases");
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value2] of srcMap) {
        if (map instanceof Map) {
          if (!map.has(key))
            map.set(key, value2);
        } else if (map instanceof Set) {
          map.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map, key)) {
          Object.defineProperty(map, key, {
            value: value2,
            writable: true,
            enumerable: true,
            configurable: true
          });
        }
      }
      return map;
    }
    function resolveAliasValue(ctx, value) {
      return ctx && identity.isAlias(value) ? value.resolve(ctx.doc, ctx) : value;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  }
});

// node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  "node_modules/yaml/dist/nodes/addPairToJSMap.js"(exports) {
    "use strict";
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map, { key, value }) {
      if (identity.isNode(key) && key.addToJSMap)
        key.addToJSMap(ctx, map, value);
      else if (merge.isMergeKey(ctx, key))
        merge.addMergeToJSMap(ctx, map, value);
      else {
        const jsKey = toJS.toJS(key, "", ctx);
        if (map instanceof Map) {
          map.set(jsKey, toJS.toJS(value, jsKey, ctx));
        } else if (map instanceof Set) {
          map.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value, stringKey, ctx);
          if (stringKey in map)
            Object.defineProperty(map, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true
            });
          else
            map[stringKey] = jsValue;
        }
      }
      return map;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null)
        return "";
      if (typeof jsKey !== "object")
        return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys())
          strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40)
            jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(ctx.doc.options.logLevel, `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`);
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  }
});

// node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  "node_modules/yaml/dist/nodes/Pair.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value;
      }
      clone(schema) {
        let { key, value } = this;
        if (identity.isNode(key))
          key = key.clone(schema);
        if (identity.isNode(value))
          value = value.clone(schema);
        return new _Pair(key, value);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  }
});

// node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyCollection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection({ comment, items }, ctx, { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment }) {
      const { indent, options: { commentString } } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment)
            comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(item, itemCtx, () => comment2 = null, () => chompKeep = true);
        if (comment2)
          str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2)
          chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line ? `
${indent}${line}` : "\n";
        }
      }
      if (comment) {
        str += "\n" + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment)
          onComment();
      } else if (chompKeep && onChompKeep)
        onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const { indent, indentStep, flowCollectionPadding: fcPadding, options: { commentString } } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore)
            lines.push("");
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment)
            comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore)
              lines.push("");
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment)
              reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment)
              comment = iv.comment;
            if (iv.commentBefore)
              reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment)
          reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => comment = null);
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes("\n"));
        if (i < items.length - 1) {
          str += ",";
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline || (reqNewline = lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ",";
          }
        }
        if (comment)
          str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line ? `
${indentStep}${indent}${line}` : "\n";
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(" ")}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep)
        comment = comment.replace(/^\n+/, "");
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  }
});

// node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLMap.js"(exports) {
    "use strict";
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k)
            return it;
          if (identity.isScalar(it.key) && it.key.value === k)
            return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:map";
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map = new this(schema);
        const add = (key, value) => {
          if (typeof replacer === "function")
            value = replacer.call(obj, key, value);
          else if (Array.isArray(replacer) && !replacer.includes(key))
            return;
          if (value !== void 0 || keepUndefined)
            map.items.push(Pair.createPair(key, value, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value] of obj)
            add(key, value);
        } else if (obj && typeof obj === "object") {
          for (const key of Object.keys(obj))
            add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === "function") {
          map.items.sort(schema.sortMapEntries);
        }
        return map;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair))
          _pair = pair;
        else if (!pair || typeof pair !== "object" || !("key" in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else
          _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite)
            throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value))
            prev.value.value = _pair.value;
          else
            prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1)
            this.items.push(_pair);
          else
            this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it)
          return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value) {
        this.add(new Pair.Pair(key, value), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const item of this.items)
          addPairToJSMap.addPairToJSMap(ctx, map, item);
        return map;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false))
          ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "",
          flowChars: { start: "{", end: "}" },
          itemIndent: ctx.indent || "",
          onChompKeep,
          onComment
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  }
});

// node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  "node_modules/yaml/dist/schema/common/map.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map = {
      collection: "map",
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: "tag:yaml.org,2002:map",
      resolve(map2, onError) {
        if (!identity.isMap(map2))
          onError("Expected a mapping for this tag");
        return map2;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx)
    };
    exports.map = map;
  }
});

// node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  "node_modules/yaml/dist/nodes/YAMLSeq.js"(exports) {
    "use strict";
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return "tag:yaml.org,2002:seq";
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value) {
        this.items.push(value);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === "number" && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value) {
        const idx = asItemIndex(key);
        if (typeof idx !== "number")
          throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value))
          prev.value = value;
        else
          this.items[idx] = value;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate)
          ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items)
          seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: "- ",
          flowChars: { start: "[", end: "]" },
          itemIndent: (ctx.indent || "") + "  ",
          onChompKeep,
          onComment
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === "function") {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === "string")
        idx = Number(idx);
      return typeof idx === "number" && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  }
});

// node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  "node_modules/yaml/dist/schema/common/seq.js"(exports) {
    "use strict";
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: "seq",
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: "tag:yaml.org,2002:seq",
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2))
          onError("Expected a sequence for this tag");
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx)
    };
    exports.seq = seq;
  }
});

// node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  "node_modules/yaml/dist/schema/common/string.js"(exports) {
    "use strict";
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value) => typeof value === "string",
      default: true,
      tag: "tag:yaml.org,2002:str",
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      }
    };
    exports.string = string;
  }
});

// node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  "node_modules/yaml/dist/schema/common/null.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value) => value == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: "tag:yaml.org,2002:null",
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) => typeof source === "string" && nullTag.test.test(source) ? source : ctx.options.nullStr
    };
    exports.nullTag = nullTag;
  }
});

// node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  "node_modules/yaml/dist/schema/core/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value) => typeof value === "boolean",
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === "t" || str[0] === "T"),
      stringify({ source, value }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === "t" || source[0] === "T";
          if (value === sv)
            return source;
        }
        return value ? ctx.options.trueStr : ctx.options.falseStr;
      }
    };
    exports.boolTag = boolTag;
  }
});

// node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyNumber.js"(exports) {
    "use strict";
    function stringifyNumber({ format, minFractionDigits, tag, value }) {
      if (typeof value === "bigint")
        return String(value);
      const num = typeof value === "number" ? value : Number(value);
      if (!isFinite(num))
        return isNaN(num) ? ".nan" : num < 0 ? "-.inf" : ".inf";
      let n = Object.is(value, -0) ? "-0" : JSON.stringify(value);
      if (!format && minFractionDigits && (!tag || tag === "tag:yaml.org,2002:float") && /^-?\d/.test(n) && !n.includes("e")) {
        let i = n.indexOf(".");
        if (i < 0) {
          i = n.length;
          n += ".";
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0)
          n += "0";
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  }
});

// node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  "node_modules/yaml/dist/schema/core/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf(".");
        if (dot !== -1 && str[str.length - 1] === "0")
          node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  "node_modules/yaml/dist/schema/core/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    var intResolve = (str, offset, radix, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value) && value >= 0)
        return prefix + value.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, "0o")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: (value) => intIdentify(value) && value >= 0,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  "node_modules/yaml/dist/schema/core/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  "node_modules/yaml/dist/schema/json/schema.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var map = require_map();
    var seq = require_seq();
    function intIdentify(value) {
      return typeof value === "bigint" || Number.isInteger(value);
    }
    var stringifyJSON = ({ value }) => JSON.stringify(value);
    var jsonScalars = [
      {
        identify: (value) => typeof value === "string",
        default: true,
        tag: "tag:yaml.org,2002:str",
        resolve: (str) => str,
        stringify: stringifyJSON
      },
      {
        identify: (value) => value == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: "tag:yaml.org,2002:null",
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON
      },
      {
        identify: (value) => typeof value === "boolean",
        default: true,
        tag: "tag:yaml.org,2002:bool",
        test: /^true$|^false$/,
        resolve: (str) => str === "true",
        stringify: stringifyJSON
      },
      {
        identify: intIdentify,
        default: true,
        tag: "tag:yaml.org,2002:int",
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => intAsBigInt ? BigInt(str) : parseInt(str, 10),
        stringify: ({ value }) => intIdentify(value) ? value.toString() : JSON.stringify(value)
      },
      {
        identify: (value) => typeof value === "number",
        default: true,
        tag: "tag:yaml.org,2002:float",
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON
      }
    ];
    var jsonError = {
      default: true,
      tag: "",
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      }
    };
    var schema = [map.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/binary.js"(exports) {
    "use strict";
    var node_buffer = __require("buffer");
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value) => value instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: "tag:yaml.org,2002:binary",
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === "function") {
          return node_buffer.Buffer.from(src, "base64");
        } else if (typeof atob === "function") {
          const str = atob(src.replace(/[\n\r]/g, ""));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i)
            buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError("This environment does not support reading binary tags; either Buffer or atob is required");
          return src;
        }
      },
      stringify({ comment, type, value }, ctx, onComment, onChompKeep) {
        if (!value)
          return "";
        const buf = value;
        let str;
        if (typeof node_buffer.Buffer === "function") {
          str = buf instanceof node_buffer.Buffer ? buf.toString("base64") : node_buffer.Buffer.from(buf.buffer).toString("base64");
        } else if (typeof btoa === "function") {
          let s = "";
          for (let i = 0; i < buf.length; ++i)
            s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error("This environment does not support writing binary tags; either Buffer or btoa is required");
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? "\n" : " ");
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      }
    };
    exports.binary = binary;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/pairs.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item))
            continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1)
              onError("Each pair must have its own sequence indicator");
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore ? `${item.commentBefore}
${pair.key.commentBefore}` : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment ? `${item.comment}
${cn.comment}` : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else
        onError("Expected a sequence for this tag");
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = "tag:yaml.org,2002:pairs";
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === "function")
            it = replacer.call(iterable, String(i++), it);
          let key, value;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value = it[1];
            } else
              throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys = Object.keys(it);
            if (keys.length === 1) {
              key = keys[0];
              value = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: "seq",
      default: false,
      tag: "tag:yaml.org,2002:pairs",
      resolve: resolvePairs,
      createNode: createPairs
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/omap.js"(exports) {
    "use strict";
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx)
          return super.toJSON(_);
        const map = /* @__PURE__ */ new Map();
        if (ctx?.onCreate)
          ctx.onCreate(map);
        for (const pair of this.items) {
          let key, value;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, "", ctx);
            value = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, "", ctx);
          }
          if (map.has(key))
            throw new Error("Ordered maps must not include duplicate keys");
          map.set(key, value);
        }
        return map;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = "tag:yaml.org,2002:omap";
    var omap = {
      collection: "seq",
      identify: (value) => value instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: "tag:yaml.org,2002:omap",
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx)
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/bool.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function boolStringify({ value, source }, ctx) {
      const boolObj = value ? trueTag : falseTag;
      if (source && boolObj.test.test(source))
        return source;
      return value ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value) => value === true,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify
    };
    var falseTag = {
      identify: (value) => value === false,
      default: true,
      tag: "tag:yaml.org,2002:bool",
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/float.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) => str.slice(-3).toLowerCase() === "nan" ? NaN : str[0] === "-" ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber
    };
    var floatExp = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "EXP",
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, "")),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      }
    };
    var float = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, "")));
        const dot = str.indexOf(".");
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, "");
          if (f[f.length - 1] === "0")
            node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/int.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value) => typeof value === "bigint" || Number.isInteger(value);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === "-" || sign === "+")
        offset += 1;
      str = str.substring(offset).replace(/_/g, "");
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === "-" ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === "-" ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value } = node;
      if (intIdentify(value)) {
        const str = value.toString(radix);
        return value < 0 ? "-" + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "BIN",
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, "0b")
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "OCT",
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, "0")
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "HEX",
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, "0x")
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/set.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key))
          pair = key;
        else if (key && typeof key === "object" && "key" in key && "value" in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else
          pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev)
          this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? identity.isScalar(pair.key) ? pair.key.value : pair.key : pair;
      }
      set(key, value) {
        if (typeof value !== "boolean")
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx)
          return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else
          throw new Error("Set items must all have null values");
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value of iterable) {
            if (typeof replacer === "function")
              value = replacer.call(iterable, value, value);
            set2.items.push(Pair.createPair(value, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = "tag:yaml.org,2002:set";
    var set = {
      collection: "map",
      identify: (value) => value instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: "tag:yaml.org,2002:set",
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map, onError) {
        if (identity.isMap(map)) {
          if (map.hasAllNullValues(true))
            return Object.assign(new YAMLSet(), map);
          else
            onError("Set items must all have null values");
        } else
          onError("Expected a mapping for this tag");
        return map;
      }
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/timestamp.js"(exports) {
    "use strict";
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === "-" || sign === "+" ? str.substring(1) : str;
      const num = (n) => asBigInt ? BigInt(n) : Number(n);
      const res = parts.replace(/_/g, "").split(":").reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === "-" ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value } = node;
      let num = (n) => n;
      if (typeof value === "bigint")
        num = (n) => BigInt(n);
      else if (isNaN(value) || !isFinite(value))
        return stringifyNumber.stringifyNumber(node);
      let sign = "";
      if (value < 0) {
        sign = "-";
        value *= num(-1);
      }
      const _60 = num(60);
      const parts = [value % _60];
      if (value < 60) {
        parts.unshift(0);
      } else {
        value = (value - parts[0]) / _60;
        parts.unshift(value % _60);
        if (value >= 60) {
          value = (value - parts[0]) / _60;
          parts.unshift(value);
        }
      }
      return sign + parts.map((n) => String(n).padStart(2, "0")).join(":").replace(/000000\d*$/, "");
    }
    var intTime = {
      identify: (value) => typeof value === "bigint" || Number.isInteger(value),
      default: true,
      tag: "tag:yaml.org,2002:int",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal
    };
    var floatTime = {
      identify: (value) => typeof value === "number",
      default: true,
      tag: "tag:yaml.org,2002:float",
      format: "TIME",
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal
    };
    var timestamp = {
      identify: (value) => value instanceof Date,
      default: true,
      tag: "tag:yaml.org,2002:timestamp",
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp("^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$"),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match)
          throw new Error("!!timestamp expects a date, starting with yyyy-mm-dd");
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + "00").substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== "Z") {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30)
            d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value }) => value?.toISOString().replace(/(T00:00:00)?\.000Z$/, "") ?? ""
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  }
});

// node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  "node_modules/yaml/dist/schema/yaml-1.1/schema.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp
    ];
    exports.schema = schema;
  }
});

// node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  "node_modules/yaml/dist/schema/tags.js"(exports) {
    "use strict";
    var map = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ["core", schema.schema],
      ["failsafe", [map.map, seq.seq, string.string]],
      ["json", schema$1.schema],
      ["yaml11", schema$2.schema],
      ["yaml-1.1", schema$2.schema]
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp
    };
    var coreKnownTags = {
      "tag:yaml.org,2002:binary": binary.binary,
      "tag:yaml.org,2002:merge": merge.merge,
      "tag:yaml.org,2002:omap": omap.omap,
      "tag:yaml.org,2002:pairs": pairs.pairs,
      "tag:yaml.org,2002:set": set.set,
      "tag:yaml.org,2002:timestamp": timestamp.timestamp
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags))
          tags = [];
        else {
          const keys = Array.from(schemas.keys()).filter((key) => key !== "yaml11").map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags)
          tags = tags.concat(tag);
      } else if (typeof customTags === "function") {
        tags = customTags(tags.slice());
      }
      if (addMergeTag)
        tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === "string" ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys = Object.keys(tagsByName).map((key) => JSON.stringify(key)).join(", ");
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys}`);
        }
        if (!tags2.includes(tagObj))
          tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  }
});

// node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  "node_modules/yaml/dist/schema/Schema.js"(exports) {
    "use strict";
    var identity = require_identity();
    var map = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat) ? tags.getTags(compat, "compat") : compat ? tags.getTags(null, compat) : null;
        this.name = typeof schema === "string" && schema || "core";
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries = typeof sortMapEntries === "function" ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  }
});

// node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  "node_modules/yaml/dist/stringify/stringifyDocument.js"(exports) {
    "use strict";
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart)
          hasDirectives = true;
      }
      if (hasDirectives)
        lines.push("---");
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1)
          lines.unshift("");
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ""));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives)
            lines.push("");
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ""));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => chompKeep = true;
        let body = stringify.stringify(doc.contents, ctx, () => contentComment = null, onChompKeep);
        if (contentComment)
          body += stringifyComment.lineComment(body, "", commentString(contentComment));
        if ((body[0] === "|" || body[0] === ">") && lines[lines.length - 1] === "---") {
          lines[lines.length - 1] = `--- ${body}`;
        } else
          lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes("\n")) {
            lines.push("...");
            lines.push(stringifyComment.indentComment(cs, ""));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push("...");
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep)
          dc = dc.replace(/^\n+/, "");
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== "")
            lines.push("");
          lines.push(stringifyComment.indentComment(commentString(dc), ""));
        }
      }
      return lines.join("\n") + "\n";
    }
    exports.stringifyDocument = stringifyDocument;
  }
});

// node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  "node_modules/yaml/dist/doc/Document.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document2 = class _Document {
      constructor(value, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === "function" || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign({
          intAsBigInt: false,
          keepSourceTokens: false,
          logLevel: "warn",
          prettyErrors: true,
          strict: true,
          stringKeys: false,
          uniqueKeys: true,
          version: "1.2"
        }, options);
        this.options = opt;
        let { version: version2 } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit)
            version2 = this.directives.yaml.version;
        } else
          this.directives = new directives.Directives({ version: version2 });
        this.setSchema(version2, options);
        this.contents = value === void 0 ? null : this.createNode(value, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC }
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives)
          copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range)
          copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value) {
        if (assertCollection(this.contents))
          this.contents.add(value);
      }
      /** Adds a value to the document. */
      addIn(path, value) {
        if (assertCollection(this.contents))
          this.contents.addIn(path, value);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          !name || prev.has(name) ? anchors.findNewAnchor(name || "a", prev) : name;
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === "function") {
          value = replacer.call({ "": value }, "", value);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === "number" || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0)
            replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || "a"
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects
        };
        const node = createNode.createNode(value, tag, ctx);
        if (flow && identity.isCollection(node))
          node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path) {
        if (Collection.isEmptyPath(path)) {
          if (this.contents == null)
            return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path, keepScalar) {
        if (Collection.isEmptyPath(path))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path) {
        if (Collection.isEmptyPath(path))
          return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path, value) {
        if (Collection.isEmptyPath(path)) {
          this.contents = value;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path), value);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path, value);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version2, options = {}) {
        if (typeof version2 === "number")
          version2 = String(version2);
        let opt;
        switch (version2) {
          case "1.1":
            if (this.directives)
              this.directives.yaml.version = "1.1";
            else
              this.directives = new directives.Directives({ version: "1.1" });
            opt = { resolveKnownTags: false, schema: "yaml-1.1" };
            break;
          case "1.2":
          case "next":
            if (this.directives)
              this.directives.yaml.version = version2;
            else
              this.directives = new directives.Directives({ version: version2 });
            opt = { resolveKnownTags: true, schema: "core" };
            break;
          case null:
            if (this.directives)
              delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version2);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object)
          this.schema = options.schema;
        else if (opt)
          this.schema = new Schema.Schema(Object.assign(opt, options));
        else
          throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === "number" ? maxAliasCount : 100
        };
        const res = toJS.toJS(this.contents, jsonArg ?? "", ctx);
        if (typeof onAnchor === "function")
          for (const { count, res: res2 } of ctx.anchors.values())
            onAnchor(res2, count);
        return typeof reviver === "function" ? applyReviver.applyReviver(reviver, { "": res }, "", res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0)
          throw new Error("Document with errors cannot be stringified");
        if ("indent" in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents))
        return true;
      throw new Error("Expected a YAML collection as document contents");
    }
    exports.Document = Document2;
  }
});

// node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  "node_modules/yaml/dist/errors.js"(exports) {
    "use strict";
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLParseError", pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super("YAMLWarning", pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1)
        return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, "");
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = "\u2026" + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80)
        lineStr = lineStr.substring(0, 79) + "\u2026";
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80)
          prev = prev.substring(0, 79) + "\u2026\n";
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = " ".repeat(ci) + "^".repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  }
});

// node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  "node_modules/yaml/dist/compose/resolve-props.js"(exports) {
    "use strict";
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = "";
      let commentSep = "";
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token of tokens) {
        if (reqSpace) {
          if (token.type !== "space" && token.type !== "newline" && token.type !== "comma")
            onError(token.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token.type !== "comment" && token.type !== "newline") {
            onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
          }
          tab = null;
        }
        switch (token.type) {
          case "space":
            if (!flow && (indicator !== "doc-start" || next?.type !== "flow-collection") && token.source.includes("	")) {
              tab = token;
            }
            hasSpace = true;
            break;
          case "comment": {
            if (!hasSpace)
              onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
            const cb = token.source.substring(1) || " ";
            if (!comment)
              comment = cb;
            else
              comment += commentSep + cb;
            commentSep = "";
            atNewline = false;
            break;
          }
          case "newline":
            if (atNewline) {
              if (comment)
                comment += token.source;
              else if (!found || indicator !== "seq-item-ind")
                spaceBefore = true;
            } else
              commentSep += token.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag)
              newlineAfterProp = token;
            hasSpace = true;
            break;
          case "anchor":
            if (anchor)
              onError(token, "MULTIPLE_ANCHORS", "A node can have at most one anchor");
            if (token.source.endsWith(":"))
              onError(token.offset + token.source.length - 1, "BAD_ALIAS", "Anchor ending in : is ambiguous", true);
            anchor = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case "tag": {
            if (tag)
              onError(token, "MULTIPLE_TAGS", "A node can have at most one tag");
            tag = token;
            start ?? (start = token.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token, "BAD_PROP_ORDER", `Anchors and tags must be after the ${token.source} indicator`);
            if (found)
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.source} in ${flow ?? "collection"}`);
            found = token;
            atNewline = indicator === "seq-item-ind" || indicator === "explicit-key-ind";
            hasSpace = false;
            break;
          case "comma":
            if (flow) {
              if (comma)
                onError(token, "UNEXPECTED_TOKEN", `Unexpected , in ${flow}`);
              comma = token;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token, "UNEXPECTED_TOKEN", `Unexpected ${token.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (reqSpace && next && next.type !== "space" && next.type !== "newline" && next.type !== "comma" && (next.type !== "scalar" || next.source !== "")) {
        onError(next.offset, "MISSING_CHAR", "Tags and anchors must be separated from the next token by white space");
      }
      if (tab && (atNewline && tab.indent <= parentIndent || next?.type === "block-map" || next?.type === "block-seq"))
        onError(tab, "TAB_AS_INDENT", "Tabs are not allowed as indentation");
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end
      };
    }
    exports.resolveProps = resolveProps;
  }
});

// node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  "node_modules/yaml/dist/compose/util-contains-newline.js"(exports) {
    "use strict";
    function containsNewline(key) {
      if (!key)
        return null;
      switch (key.type) {
        case "alias":
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          if (key.source.includes("\n"))
            return true;
          if (key.end) {
            for (const st of key.end)
              if (st.type === "newline")
                return true;
          }
          return false;
        case "flow-collection":
          for (const it of key.items) {
            for (const st of it.start)
              if (st.type === "newline")
                return true;
            if (it.sep) {
              for (const st of it.sep)
                if (st.type === "newline")
                  return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value))
              return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  }
});

// node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  "node_modules/yaml/dist/compose/util-flow-indent-check.js"(exports) {
    "use strict";
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === "flow-collection") {
        const end = fc.end[0];
        if (end.indent === indent && (end.source === "]" || end.source === "}") && utilContainsNewline.containsNewline(fc)) {
          const msg = "Flow end indicator should be more indented than parent";
          onError(end, "BAD_INDENT", msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  }
});

// node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  "node_modules/yaml/dist/compose/util-map-includes.js"(exports) {
    "use strict";
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false)
        return false;
      const isEqual = typeof uniqueKeys === "function" ? uniqueKeys : (a, b) => a === b || identity.isScalar(a) && identity.isScalar(b) && a.value === b.value;
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  }
});

// node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-map.js"(exports) {
    "use strict";
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = "All mapping items must start at the same column";
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep: sep5, value } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: "explicit-key-ind",
          next: key ?? sep5?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === "block-seq")
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "A block sequence may not be used as an implicit map key");
            else if ("indent" in key && key.indent !== bm.indent)
              onError(offset, "BAD_INDENT", startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep5) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map.comment)
                map.comment += "\n" + keyProps.comment;
              else
                map.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(key ?? start[start.length - 1], "MULTILINE_IMPLICIT_KEY", "Implicit keys need to be on a single line");
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, "BAD_INDENT", startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key ? composeNode(ctx, key, keyProps, onError) : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
          onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
        const valueProps = resolveProps.resolveProps(sep5 ?? [], {
          indicator: "map-value-ind",
          next: value,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === "block-scalar"
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value?.type === "block-map" && !valueProps.hasNewline)
              onError(offset, "BLOCK_AS_IMPLICIT_KEY", "Nested mappings are not allowed in compact mappings");
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(keyNode.range, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit block mapping key");
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : composeEmptyNode(ctx, offset, sep5, null, valueProps, onError);
          if (ctx.schema.compat)
            utilFlowIndentCheck.flowIndentCheck(bm.indent, value, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, "MISSING_CHAR", "Implicit map keys need to be followed by map values");
          if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          map.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset)
        onError(commentEnd, "IMPOSSIBLE", "Map comment with trailing content");
      map.range = [bm.offset, offset, commentEnd ?? offset];
      return map;
    }
    exports.resolveBlockMap = resolveBlockMap;
  }
});

// node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-seq.js"(exports) {
    "use strict";
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: "seq-item-ind",
          next: value,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true
        });
        if (!props.found) {
          if (props.anchor || props.tag || value) {
            if (value?.type === "block-seq")
              onError(props.end, "BAD_INDENT", "All sequence items must start at the same column");
            else
              onError(offset, "MISSING_CHAR", "Sequence item without - indicator");
          } else {
            commentEnd = props.end;
            if (props.comment)
              seq.comment = props.comment;
            continue;
          }
        }
        const node = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat)
          utilFlowIndentCheck.flowIndentCheck(bs.indent, value, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  }
});

// node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  "node_modules/yaml/dist/compose/resolve-end.js"(exports) {
    "use strict";
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = "";
      if (end) {
        let hasSpace = false;
        let sep5 = "";
        for (const token of end) {
          const { source, type } = token;
          switch (type) {
            case "space":
              hasSpace = true;
              break;
            case "comment": {
              if (reqSpace && !hasSpace)
                onError(token, "MISSING_CHAR", "Comments must be separated from other tokens by white space characters");
              const cb = source.substring(1) || " ";
              if (!comment)
                comment = cb;
              else
                comment += sep5 + cb;
              sep5 = "";
              break;
            }
            case "newline":
              if (comment)
                sep5 += source;
              hasSpace = true;
              break;
            default:
              onError(token, "UNEXPECTED_TOKEN", `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = "Block collections are not allowed within flow collections";
    var isBlock = (token) => token && (token.type === "block-map" || token.type === "block-seq");
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap2 = fc.start.source === "{";
      const fcName = isMap2 ? "flow map" : "flow sequence";
      const NodeClass = tag?.nodeClass ?? (isMap2 ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot)
        ctx.atRoot = false;
      if (ctx.atKey)
        ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep: sep5, value } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: "explicit-key-ind",
          next: key ?? sep5?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep5 && !value) {
            if (i === 0 && props.comma)
              onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, "UNEXPECTED_TOKEN", `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment)
                coll.comment += "\n" + props.comment;
              else
                coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap2 && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              "MULTILINE_IMPLICIT_KEY",
              "Implicit keys of flow sequence pairs need to be on a single line"
            );
        }
        if (i === 0) {
          if (props.comma)
            onError(props.comma, "UNEXPECTED_TOKEN", `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma)
            onError(props.start, "MISSING_CHAR", `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = "";
            loop: for (const st of start) {
              switch (st.type) {
                case "comma":
                case "space":
                  break;
                case "comment":
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev))
                prev = prev.value ?? prev.key;
              if (prev.comment)
                prev.comment += "\n" + prevItemComment;
              else
                prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap2 && !sep5 && !props.found) {
          const valueNode = value ? composeNode(ctx, value, props, onError) : composeEmptyNode(ctx, props.end, sep5, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value))
            onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key ? composeNode(ctx, key, props, onError) : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key))
            onError(keyNode.range, "BLOCK_IN_FLOW", blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep5 ?? [], {
            flow: fcName,
            indicator: "map-value-ind",
            next: value,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false
          });
          if (valueProps.found) {
            if (!isMap2 && !props.found && ctx.options.strict) {
              if (sep5)
                for (const st of sep5) {
                  if (st === valueProps.found)
                    break;
                  if (st.type === "newline") {
                    onError(st, "MULTILINE_IMPLICIT_KEY", "Implicit keys of flow sequence pairs need to be on a single line");
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(valueProps.found, "KEY_OVER_1024_CHARS", "The : indicator must be at most 1024 chars after the start of an implicit flow sequence key");
            }
          } else if (value) {
            if ("source" in value && value.source?.[0] === ":")
              onError(value, "MISSING_CHAR", `Missing space after : in ${fcName}`);
            else
              onError(valueProps.start, "MISSING_CHAR", `Missing , or : between ${fcName} items`);
          }
          const valueNode = value ? composeNode(ctx, value, valueProps, onError) : valueProps.found ? composeEmptyNode(ctx, valueProps.end, sep5, null, valueProps, onError) : null;
          if (valueNode) {
            if (isBlock(value))
              onError(valueNode.range, "BLOCK_IN_FLOW", blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment)
              keyNode.comment += "\n" + valueProps.comment;
            else
              keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens)
            pair.srcToken = collItem;
          if (isMap2) {
            const map = coll;
            if (utilMapIncludes.mapIncludes(ctx, map.items, keyNode))
              onError(keyStart, "DUPLICATE_KEY", "Map keys must be unique");
            map.items.push(pair);
          } else {
            const map = new YAMLMap.YAMLMap(ctx.schema);
            map.flow = true;
            map.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap2 ? "}" : "]";
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd)
        cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot ? `${name} must end with a ${expectedEnd}` : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? "MISSING_CHAR" : "BAD_INDENT", msg);
        if (ce && ce.source.length !== 1)
          ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment)
            coll.comment += "\n" + end.comment;
          else
            coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  }
});

// node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  "node_modules/yaml/dist/compose/compose-collection.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token, onError, tagName, tag) {
      const coll = token.type === "block-map" ? resolveBlockMap.resolveBlockMap(CN, ctx, token, onError, tag) : token.type === "block-seq" ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token, onError, tag) : resolveFlowCollection.resolveFlowCollection(CN, ctx, token, onError, tag);
      const Coll = coll.constructor;
      if (tagName === "!" || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName)
        coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken ? null : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg));
      if (token.type === "block-seq") {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp = anchor && tagToken ? anchor.offset > tagToken.offset ? anchor : tagToken : anchor ?? tagToken;
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = "Missing newline after block sequence props";
          onError(lastProp, "MISSING_CHAR", message);
        }
      }
      const expType = token.type === "block-map" ? "map" : token.type === "block-seq" ? "seq" : token.start.source === "{" ? "map" : "seq";
      if (!tagToken || !tagName || tagName === "!" || tagName === YAMLMap.YAMLMap.tagName && expType === "map" || tagName === YAMLSeq.YAMLSeq.tagName && expType === "seq") {
        return resolveCollection(CN, ctx, token, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(tagToken, "BAD_COLLECTION_TYPE", `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? "scalar"}`, true);
          } else {
            onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format)
        node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  }
});

// node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-block-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header)
        return { value: "", type: null, comment: "", range: [start, start, start] };
      const type = header.mode === ">" ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === "" || content === "\r")
          chompStart = i;
        else
          break;
      }
      if (chompStart === 0) {
        const value2 = header.chomp === "+" && lines.length > 0 ? "\n".repeat(Math.max(1, lines.length - 1)) : "";
        let end2 = start + header.length;
        if (scalar.source)
          end2 += scalar.source.length;
        return { value: value2, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === "" || content === "\r") {
          if (header.indent === 0 && indent.length > trimIndent)
            trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message = "Block scalars with more-indented leading empty lines must use an explicit indentation indicator";
            onError(offset + indent.length, "MISSING_CHAR", message);
          }
          if (header.indent === 0)
            trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = "Block scalar values in collections must be indented";
            onError(offset, "BAD_INDENT", message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent)
          chompStart = i + 1;
      }
      let value = "";
      let sep5 = "";
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i)
        value += lines[i][0].slice(trimIndent) + "\n";
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === "\r";
        if (crlf)
          content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? "explicit indentation indicator" : "first line";
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), "BAD_INDENT", message);
          indent = "";
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value += sep5 + indent.slice(trimIndent) + content;
          sep5 = "\n";
        } else if (indent.length > trimIndent || content[0] === "	") {
          if (sep5 === " ")
            sep5 = "\n";
          else if (!prevMoreIndented && sep5 === "\n")
            sep5 = "\n\n";
          value += sep5 + indent.slice(trimIndent) + content;
          sep5 = "\n";
          prevMoreIndented = true;
        } else if (content === "") {
          if (sep5 === "\n")
            value += "\n";
          else
            sep5 = "\n";
        } else {
          value += sep5 + content;
          sep5 = " ";
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case "-":
          break;
        case "+":
          for (let i = chompStart; i < lines.length; ++i)
            value += "\n" + lines[i][0].slice(trimIndent);
          if (value[value.length - 1] !== "\n")
            value += "\n";
          break;
        default:
          value += "\n";
      }
      const end = start + header.length + scalar.source.length;
      return { value, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== "block-scalar-header") {
        onError(props[0], "IMPOSSIBLE", "Block scalar header not found");
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = "";
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === "-" || ch === "+"))
          chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n)
            indent = n;
          else if (error === -1)
            error = offset + i;
        }
      }
      if (error !== -1)
        onError(error, "UNEXPECTED_TOKEN", `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = "";
      let length = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token = props[i];
        switch (token.type) {
          case "space":
            hasSpace = true;
          // fallthrough
          case "newline":
            length += token.source.length;
            break;
          case "comment":
            if (strict && !hasSpace) {
              const message = "Comments must be separated from other tokens by white space characters";
              onError(token, "MISSING_CHAR", message);
            }
            length += token.source.length;
            comment = token.source.substring(1);
            break;
          case "error":
            onError(token, "UNEXPECTED_TOKEN", token.message);
            length += token.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token.type}`;
            onError(token, "UNEXPECTED_TOKEN", message);
            const ts = token.source;
            if (ts && typeof ts === "string")
              length += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ["", first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2)
        lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  }
});

// node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  "node_modules/yaml/dist/compose/resolve-flow-scalar.js"(exports) {
    "use strict";
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case "scalar":
          _type = Scalar.Scalar.PLAIN;
          value = plainValue(source, _onError);
          break;
        case "single-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value = singleQuotedValue(source, _onError);
          break;
        case "double-quoted-scalar":
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, "UNEXPECTED_TOKEN", `Expected a flow scalar value, but found: ${type}`);
          return {
            value: "",
            type: null,
            comment: "",
            range: [offset, offset + source.length, offset + source.length]
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset]
      };
    }
    function plainValue(source, onError) {
      let badChar = "";
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case "	":
          badChar = "a tab character";
          break;
        case ",":
          badChar = "flow indicator character ,";
          break;
        case "%":
          badChar = "directive indicator character %";
          break;
        case "|":
        case ">": {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case "@":
        case "`": {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar)
        onError(0, "BAD_SCALAR_START", `Plain value cannot start with ${badChar}`);
      return unfoldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, "MISSING_CHAR", "Missing closing 'quote");
      return unfoldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function unfoldLines(source) {
      const line = /(.*?)\r?\n/sy;
      let match = line.exec(source);
      if (!match)
        return source;
      let trimEnd, trimBoth;
      try {
        trimEnd = new RegExp("(?<![ 	])[ 	]+$");
        trimBoth = new RegExp("^[ 	]+|(?<![ 	])[ 	]+$", "g");
      } catch {
        trimEnd = /[ \t]+$/;
        trimBoth = /^[ \t]+|[ \t]+$/g;
      }
      let res = match[1].replace(trimEnd, "");
      let sep5 = " ";
      let pos = line.lastIndex;
      while (match = line.exec(source)) {
        const lm = match[1].replace(trimBoth, "");
        if (lm === "") {
          if (sep5 === "\n")
            res += sep5;
          else
            sep5 = "\n";
        } else {
          res += sep5 + lm;
          sep5 = " ";
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep5 + (match?.[1] ?? "");
    }
    function doubleQuotedValue(source, onError) {
      let res = "";
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === "\r" && source[i + 1] === "\n")
          continue;
        if (ch === "\n") {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === "\\") {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc)
            res += cc;
          else if (next === "\n") {
            next = source[i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "\r" && source[i + 1] === "\n") {
            next = source[++i + 1];
            while (next === " " || next === "	")
              next = source[++i + 1];
          } else if (next === "x" || next === "u" || next === "U") {
            const length = next === "x" ? 2 : next === "u" ? 4 : 8;
            res += parseCharCode(source, i + 1, length, onError);
            i += length;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === " " || ch === "	") {
          const wsStart = i;
          let next = source[i + 1];
          while (next === " " || next === "	")
            next = source[++i + 1];
          if (next !== "\n" && !(next === "\r" && source[i + 2] === "\n"))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, "MISSING_CHAR", 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = "";
      let ch = source[offset + 1];
      while (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
        if (ch === "\r" && source[offset + 2] !== "\n")
          break;
        if (ch === "\n")
          fold += "\n";
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold)
        fold = " ";
      return { fold, offset };
    }
    var escapeCodes = {
      "0": "\0",
      // null character
      a: "\x07",
      // bell character
      b: "\b",
      // backspace
      e: "\x1B",
      // escape character
      f: "\f",
      // form feed
      n: "\n",
      // line feed
      r: "\r",
      // carriage return
      t: "	",
      // horizontal tab
      v: "\v",
      // vertical tab
      N: "\x85",
      // Unicode next line
      _: "\xA0",
      // Unicode non-breaking space
      L: "\u2028",
      // Unicode line separator
      P: "\u2029",
      // Unicode paragraph separator
      " ": " ",
      '"': '"',
      "/": "/",
      "\\": "\\",
      "	": "	"
    };
    function parseCharCode(source, offset, length, onError) {
      const cc = source.substr(offset, length);
      const ok = cc.length === length && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length + 2);
        onError(offset - 2, "BAD_DQ_ESCAPE", `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  }
});

// node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  "node_modules/yaml/dist/compose/compose-scalar.js"(exports) {
    "use strict";
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token, tagToken, onError) {
      const { value, type, comment, range } = token.type === "block-scalar" ? resolveBlockScalar.resolveBlockScalar(ctx, token, onError) : resolveFlowScalar.resolveFlowScalar(token, ctx.options.strict, onError);
      const tagName = tagToken ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, "TAG_RESOLVE_FAILED", msg)) : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName)
        tag = findScalarTagByName(ctx.schema, value, tagName, tagToken, onError);
      else if (token.type === "scalar")
        tag = findScalarTagByTest(ctx, value, token, onError);
      else
        tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value, (msg) => onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token, "TAG_RESOLVE_FAILED", msg);
        scalar = new Scalar.Scalar(value);
      }
      scalar.range = range;
      scalar.source = value;
      if (type)
        scalar.type = type;
      if (tagName)
        scalar.tag = tagName;
      if (tag.format)
        scalar.format = tag.format;
      if (comment)
        scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value, tagName, tagToken, onError) {
      if (tagName === "!")
        return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test)
            matchWithTest.push(tag);
          else
            return tag;
        }
      }
      for (const tag of matchWithTest)
        if (tag.test?.test(value))
          return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, "TAG_RESOLVE_FAILED", `Unresolved tag: ${tagName}`, tagName !== "tag:yaml.org,2002:str");
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value, token, onError) {
      const tag = schema.tags.find((tag2) => (tag2.default === true || atKey && tag2.default === "key") && tag2.test?.test(value)) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token, "TAG_RESOLVE_FAILED", msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  }
});

// node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  "node_modules/yaml/dist/compose/util-empty-scalar-position.js"(exports) {
    "use strict";
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case "space":
            case "comment":
            case "newline":
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === "space") {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  }
});

// node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  "node_modules/yaml/dist/compose/compose-node.js"(exports) {
    "use strict";
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token.type) {
        case "alias":
          node = composeAlias(ctx, token, onError);
          if (anchor || tag)
            onError(token, "ALIAS_PROPS", "An alias node must not specify any properties");
          break;
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "block-scalar":
          node = composeScalar.composeScalar(ctx, token, tag, onError);
          if (anchor)
            node.anchor = anchor.source.substring(1);
          break;
        case "block-map":
        case "block-seq":
        case "flow-collection":
          try {
            node = composeCollection.composeCollection(CN, ctx, token, props, onError);
            if (anchor)
              node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token, "RESOURCE_EXHAUSTION", message);
          }
          break;
        default: {
          const message = token.type === "error" ? token.message : `Unsupported token (type: ${token.type})`;
          onError(token, "UNEXPECTED_TOKEN", message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token.offset, void 0, null, props, onError));
      if (anchor && node.anchor === "")
        onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      if (atKey && ctx.options.stringKeys && (!identity.isScalar(node) || typeof node.value !== "string" || node.tag && node.tag !== "tag:yaml.org,2002:str")) {
        const msg = "With stringKeys, all keys must be strings";
        onError(tag ?? token, "NON_STRING_KEY", msg);
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        if (token.type === "scalar" && token.source === "")
          node.comment = comment;
        else
          node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken)
        node.srcToken = token;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token = {
        type: "scalar",
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: ""
      };
      const node = composeScalar.composeScalar(ctx, token, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === "")
          onError(anchor, "BAD_ALIAS", "Anchor cannot be an empty string");
      }
      if (spaceBefore)
        node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === "")
        onError(offset, "BAD_ALIAS", "Alias cannot be an empty string");
      if (alias.source.endsWith(":"))
        onError(offset + source.length - 1, "BAD_ALIAS", "Alias ending in : is ambiguous", true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment)
        alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  }
});

// node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  "node_modules/yaml/dist/compose/compose-doc.js"(exports) {
    "use strict";
    var Document2 = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document2.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema
      };
      const props = resolveProps.resolveProps(start, {
        indicator: "doc-start",
        next: value ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value && (value.type === "block-map" || value.type === "block-seq") && !props.hasNewline)
          onError(props.end, "MISSING_CHAR", "Block collection cannot start on same line with directives-end marker");
      }
      doc.contents = value ? composeNode.composeNode(ctx, value, props, onError) : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment)
        doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  }
});

// node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  "node_modules/yaml/dist/compose/composer.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var directives = require_directives();
    var Document2 = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === "number")
        return [src, src + 1];
      if (Array.isArray(src))
        return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === "string" ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = "";
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case "#":
            comment += (comment === "" ? "" : afterEmptyLine ? "\n\n" : "\n") + (source.substring(1) || " ");
            atComment = true;
            afterEmptyLine = false;
            break;
          case "%":
            if (prelude[i + 1]?.[0] !== "#")
              i += 1;
            atComment = false;
            break;
          default:
            if (!atComment)
              afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning)
            this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else
            this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || "1.2" });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment ? `${doc.comment}
${comment}` : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it))
              it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb ? `${comment}
${cb}` : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb ? `${comment}
${cb}` : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i)
            doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i)
            doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token of tokens)
          yield* this.next(token);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token) {
        if (node_process.env.LOG_STREAM)
          console.dir(token, { depth: null });
        switch (token.type) {
          case "directive":
            this.directives.add(token.source, (offset, message, warning) => {
              const pos = getErrorPos(token);
              pos[0] += offset;
              this.onError(pos, "BAD_DIRECTIVE", message, warning);
            });
            this.prelude.push(token.source);
            this.atDirectives = true;
            break;
          case "document": {
            const doc = composeDoc.composeDoc(this.options, this.directives, token, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token, "MISSING_CHAR", "Missing directives-end/doc-start indicator line");
            this.decorate(doc, false);
            if (this.doc)
              yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case "byte-order-mark":
          case "space":
            break;
          case "comment":
          case "newline":
            this.prelude.push(token.source);
            break;
          case "error": {
            const msg = token.source ? `${token.message}: ${JSON.stringify(token.source)}` : token.message;
            const error = new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg);
            if (this.atDirectives || !this.doc)
              this.errors.push(error);
            else
              this.doc.errors.push(error);
            break;
          }
          case "doc-end": {
            if (!this.doc) {
              const msg = "Unexpected doc-end without preceding document";
              this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(token.end, token.offset + token.source.length, this.doc.options.strict, this.onError);
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc ? `${dc}
${end.comment}` : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(new errors.YAMLParseError(getErrorPos(token), "UNEXPECTED_TOKEN", `Unsupported token ${token.type}`));
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document2.Document(void 0, opts);
          if (this.atDirectives)
            this.onError(endOffset, "MISSING_CHAR", "Missing directives-end indicator line");
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  }
});

// node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  "node_modules/yaml/dist/parse/cst-scalar.js"(exports) {
    "use strict";
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token, strict = true, onError) {
      if (token) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === "number" ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError)
            onError(offset, code, message);
          else
            throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token.type) {
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return resolveFlowScalar.resolveFlowScalar(token, strict, _onError);
          case "block-scalar":
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = "PLAIN" } = context;
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey,
        indent: indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      const end = context.end ?? [
        { type: "newline", offset: -1, indent, source: "\n" }
      ];
      switch (source[0]) {
        case "|":
        case ">": {
          const he = source.indexOf("\n");
          const head = source.substring(0, he);
          const body = source.substring(he + 1) + "\n";
          const props = [
            { type: "block-scalar-header", offset, indent, source: head }
          ];
          if (!addEndtoBlockProps(props, end))
            props.push({ type: "newline", offset: -1, indent, source: "\n" });
          return { type: "block-scalar", offset, indent, props, source: body };
        }
        case '"':
          return { type: "double-quoted-scalar", offset, indent, source, end };
        case "'":
          return { type: "single-quoted-scalar", offset, indent, source, end };
        default:
          return { type: "scalar", offset, indent, source, end };
      }
    }
    function setScalarValue(token, value, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = "indent" in token ? token.indent : null;
      if (afterKey && typeof indent === "number")
        indent += 2;
      if (!type)
        switch (token.type) {
          case "single-quoted-scalar":
            type = "QUOTE_SINGLE";
            break;
          case "double-quoted-scalar":
            type = "QUOTE_DOUBLE";
            break;
          case "block-scalar": {
            const header = token.props[0];
            if (header.type !== "block-scalar-header")
              throw new Error("Invalid block scalar header");
            type = header.source[0] === ">" ? "BLOCK_FOLDED" : "BLOCK_LITERAL";
            break;
          }
          default:
            type = "PLAIN";
        }
      const source = stringifyString.stringifyString({ type, value }, {
        implicitKey: implicitKey || indent === null,
        indent: indent !== null && indent > 0 ? " ".repeat(indent) : "",
        inFlow,
        options: { blockQuote: true, lineWidth: -1 }
      });
      switch (source[0]) {
        case "|":
        case ">":
          setBlockScalarValue(token, source);
          break;
        case '"':
          setFlowScalarValue(token, source, "double-quoted-scalar");
          break;
        case "'":
          setFlowScalarValue(token, source, "single-quoted-scalar");
          break;
        default:
          setFlowScalarValue(token, source, "scalar");
      }
    }
    function setBlockScalarValue(token, source) {
      const he = source.indexOf("\n");
      const head = source.substring(0, he);
      const body = source.substring(he + 1) + "\n";
      if (token.type === "block-scalar") {
        const header = token.props[0];
        if (header.type !== "block-scalar-header")
          throw new Error("Invalid block scalar header");
        header.source = head;
        token.source = body;
      } else {
        const { offset } = token;
        const indent = "indent" in token ? token.indent : -1;
        const props = [
          { type: "block-scalar-header", offset, indent, source: head }
        ];
        if (!addEndtoBlockProps(props, "end" in token ? token.end : void 0))
          props.push({ type: "newline", offset: -1, indent, source: "\n" });
        for (const key of Object.keys(token))
          if (key !== "type" && key !== "offset")
            delete token[key];
        Object.assign(token, { type: "block-scalar", indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case "space":
            case "comment":
              props.push(st);
              break;
            case "newline":
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token, source, type) {
      switch (token.type) {
        case "scalar":
        case "double-quoted-scalar":
        case "single-quoted-scalar":
          token.type = type;
          token.source = source;
          break;
        case "block-scalar": {
          const end = token.props.slice(1);
          let oa = source.length;
          if (token.props[0].type === "block-scalar-header")
            oa -= token.props[0].source.length;
          for (const tok of end)
            tok.offset += oa;
          delete token.props;
          Object.assign(token, { type, source, end });
          break;
        }
        case "block-map":
        case "block-seq": {
          const offset = token.offset + source.length;
          const nl = { type: "newline", offset, indent: token.indent, source: "\n" };
          delete token.items;
          Object.assign(token, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = "indent" in token ? token.indent : -1;
          const end = "end" in token && Array.isArray(token.end) ? token.end.filter((st) => st.type === "space" || st.type === "comment" || st.type === "newline") : [];
          for (const key of Object.keys(token))
            if (key !== "type" && key !== "offset")
              delete token[key];
          Object.assign(token, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  }
});

// node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  "node_modules/yaml/dist/parse/cst-stringify.js"(exports) {
    "use strict";
    var stringify = (cst) => "type" in cst ? stringifyToken(cst) : stringifyItem(cst);
    function stringifyToken(token) {
      switch (token.type) {
        case "block-scalar": {
          let res = "";
          for (const tok of token.props)
            res += stringifyToken(tok);
          return res + token.source;
        }
        case "block-map":
        case "block-seq": {
          let res = "";
          for (const item of token.items)
            res += stringifyItem(item);
          return res;
        }
        case "flow-collection": {
          let res = token.start.source;
          for (const item of token.items)
            res += stringifyItem(item);
          for (const st of token.end)
            res += st.source;
          return res;
        }
        case "document": {
          let res = stringifyItem(token);
          if (token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
        default: {
          let res = token.source;
          if ("end" in token && token.end)
            for (const st of token.end)
              res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep: sep5, value }) {
      let res = "";
      for (const st of start)
        res += st.source;
      if (key)
        res += stringifyToken(key);
      if (sep5)
        for (const st of sep5)
          res += st.source;
      if (value)
        res += stringifyToken(value);
      return res;
    }
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  "node_modules/yaml/dist/parse/cst-visit.js"(exports) {
    "use strict";
    var BREAK = /* @__PURE__ */ Symbol("break visit");
    var SKIP = /* @__PURE__ */ Symbol("skip children");
    var REMOVE = /* @__PURE__ */ Symbol("remove item");
    function visit(cst, visitor) {
      if ("type" in cst && cst.type === "document")
        cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path) => {
      let item = cst;
      for (const [field, index] of path) {
        const tok = item?.[field];
        if (tok && "items" in tok) {
          item = tok.items[index];
        } else
          return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path) => {
      const parent = visit.itemAtPath(cst, path.slice(0, -1));
      const field = path[path.length - 1][0];
      const coll = parent?.[field];
      if (coll && "items" in coll)
        return coll;
      throw new Error("Parent collection not found");
    };
    function _visit(path, item, visitor) {
      let ctrl = visitor(item, path);
      if (typeof ctrl === "symbol")
        return ctrl;
      for (const field of ["key", "value"]) {
        const token = item[field];
        if (token && "items" in token) {
          for (let i = 0; i < token.items.length; ++i) {
            const ci = _visit(Object.freeze(path.concat([[field, i]])), token.items[i], visitor);
            if (typeof ci === "number")
              i = ci - 1;
            else if (ci === BREAK)
              return BREAK;
            else if (ci === REMOVE) {
              token.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === "function" && field === "key")
            ctrl = ctrl(item, path);
        }
      }
      return typeof ctrl === "function" ? ctrl(item, path) : ctrl;
    }
    exports.visit = visit;
  }
});

// node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  "node_modules/yaml/dist/parse/cst.js"(exports) {
    "use strict";
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = "\uFEFF";
    var DOCUMENT = "";
    var FLOW_END = "";
    var SCALAR = "";
    var isCollection = (token) => !!token && "items" in token;
    var isScalar = (token) => !!token && (token.type === "scalar" || token.type === "single-quoted-scalar" || token.type === "double-quoted-scalar" || token.type === "block-scalar");
    function prettyToken(token) {
      switch (token) {
        case BOM:
          return "<BOM>";
        case DOCUMENT:
          return "<DOC>";
        case FLOW_END:
          return "<FLOW_END>";
        case SCALAR:
          return "<SCALAR>";
        default:
          return JSON.stringify(token);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return "byte-order-mark";
        case DOCUMENT:
          return "doc-mode";
        case FLOW_END:
          return "flow-error-end";
        case SCALAR:
          return "scalar";
        case "---":
          return "doc-start";
        case "...":
          return "doc-end";
        case "":
        case "\n":
        case "\r\n":
          return "newline";
        case "-":
          return "seq-item-ind";
        case "?":
          return "explicit-key-ind";
        case ":":
          return "map-value-ind";
        case "{":
          return "flow-map-start";
        case "}":
          return "flow-map-end";
        case "[":
          return "flow-seq-start";
        case "]":
          return "flow-seq-end";
        case ",":
          return "comma";
      }
      switch (source[0]) {
        case " ":
        case "	":
          return "space";
        case "#":
          return "comment";
        case "%":
          return "directive-line";
        case "*":
          return "alias";
        case "&":
          return "anchor";
        case "!":
          return "tag";
        case "'":
          return "single-quoted-scalar";
        case '"':
          return "double-quoted-scalar";
        case "|":
        case ">":
          return "block-scalar-header";
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  }
});

// node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  "node_modules/yaml/dist/parse/lexer.js"(exports) {
    "use strict";
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case " ":
        case "\n":
        case "\r":
        case "	":
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set("0123456789ABCDEFabcdef");
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(",[]{}");
    var invalidAnchorChars = new Set(" ,[]{}\n\r	");
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = "";
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== "string")
            throw TypeError("source is not a string");
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? "stream";
        while (next && (incomplete || this.hasChars(1)))
          next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === " " || ch === "	")
          ch = this.buffer[++i];
        if (!ch || ch === "#" || ch === "\n")
          return true;
        if (ch === "\r")
          return this.buffer[i + 1] === "\n";
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === " ")
            ch = this.buffer[++indent + offset];
          if (ch === "\r") {
            const next = this.buffer[indent + offset + 1];
            if (next === "\n" || !next && !this.atEnd)
              return offset + indent + 1;
          }
          return ch === "\n" || indent >= this.indentNext || !ch && !this.atEnd ? offset + indent : -1;
        }
        if (ch === "-" || ch === ".") {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === "---" || dt === "...") && isEmpty(this.buffer[offset + 3]))
            return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== "number" || end !== -1 && end < this.pos) {
          end = this.buffer.indexOf("\n", this.pos);
          this.lineEndPos = end;
        }
        if (end === -1)
          return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === "\r")
          end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case "stream":
            return yield* this.parseStream();
          case "line-start":
            return yield* this.parseLineStart();
          case "block-start":
            return yield* this.parseBlockStart();
          case "doc":
            return yield* this.parseDocument();
          case "flow":
            return yield* this.parseFlowCollection();
          case "quoted-scalar":
            return yield* this.parseQuotedScalar();
          case "block-scalar":
            return yield* this.parseBlockScalar();
          case "plain-scalar":
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null)
          return this.setNext("stream");
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === "%") {
          let dirEnd = line.length;
          let cs = line.indexOf("#");
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === " " || ch === "	") {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf("#", cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === " " || ch === "	")
              dirEnd -= 1;
            else
              break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return "stream";
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return "stream";
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd)
          return this.setNext("line-start");
        if (ch === "-" || ch === ".") {
          if (!this.atEnd && !this.hasChars(4))
            return this.setNext("line-start");
          const s = this.peek(3);
          if ((s === "---" || s === "...") && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === "---" ? "doc" : "stream";
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1)))
          this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd)
          return this.setNext("block-start");
        if ((ch0 === "-" || ch0 === "?" || ch0 === ":") && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return "block-start";
        }
        return "doc";
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null)
          return this.setNext("doc");
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case "#":
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            return "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "doc";
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case "|":
          case ">":
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null)
          return this.setNext("flow");
        if (indent !== -1 && indent < this.indentNext && line[0] !== "#" || indent === 0 && (line.startsWith("---") || line.startsWith("...")) && isEmpty(line[3])) {
          const atFlowEndMarker = indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === "]" || line[0] === "}");
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ",") {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return "flow";
          case "#":
            yield* this.pushCount(line.length - n);
            return "flow";
          case "{":
          case "[":
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return "flow";
          case "}":
          case "]":
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? "flow" : "doc";
          case "*":
            yield* this.pushUntil(isNotAnchorChar);
            return "flow";
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ":": {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ",") {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return "flow";
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'")
            end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === "\\")
              n += 1;
            if (n % 2 === 0)
              break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf("\n", this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = qb.indexOf("\n", cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === "\r" ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd)
            return this.setNext("quoted-scalar");
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? "flow" : "doc";
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === "+")
            this.blockScalarKeep = true;
          else if (ch > "0" && ch <= "9")
            this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== "-")
            break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === "#");
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; ch = this.buffer[i2]; ++i2) {
          switch (ch) {
            case " ":
              indent += 1;
              break;
            case "\n":
              nl = i2;
              indent = 0;
              break;
            case "\r": {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd)
                return this.setNext("block-scalar");
              if (next === "\n")
                break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("block-scalar");
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1)
            this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1)
              break;
            nl = this.buffer.indexOf("\n", cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd)
              return this.setNext("block-scalar");
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === " ")
          ch = this.buffer[++i];
        if (ch === "	") {
          while (ch === "	" || ch === " " || ch === "\r" || ch === "\n")
            ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === "\r")
              ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === " ")
              ch2 = this.buffer[--i2];
            if (ch2 === "\n" && i2 >= this.pos && i2 + 1 + indent > lastChar)
              nl = i2;
            else
              break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while (ch = this.buffer[++i]) {
          if (ch === ":") {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || inFlow && flowIndicatorChars.has(next))
              break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === "\r") {
              if (next === "\n") {
                i += 1;
                ch = "\n";
                next = this.buffer[i + 1];
              } else
                end = i;
            }
            if (next === "#" || inFlow && flowIndicatorChars.has(next))
              break;
            if (ch === "\n") {
              const cs = this.continueScalar(i + 1);
              if (cs === -1)
                break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch))
              break;
            end = i;
          }
        }
        if (!ch && !this.atEnd)
          return this.setNext("plain-scalar");
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? "flow" : "doc";
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty)
          yield "";
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case "!":
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case "&":
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case "-":
            // this is an error
            case "?":
            // this is an error outside flow collections
            case ":": {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || inFlow && flowIndicatorChars.has(ch1)) {
                if (!inFlow)
                  this.indentNext = this.indentValue + 1;
                else if (this.flowKey)
                  this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === "<") {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== ">")
            ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === ">" ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch))
              ch = this.buffer[++i];
            else if (ch === "%" && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[i += 3];
            } else
              break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === "\n")
          return yield* this.pushCount(1);
        else if (ch === "\r" && this.charAt(1) === "\n")
          return yield* this.pushCount(2);
        else
          return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === " " || allowTabs && ch === "	");
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch))
          ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  }
});

// node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  "node_modules/yaml/dist/parse/line-counter.js"(exports) {
    "use strict";
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = low + high >> 1;
            if (this.lineStarts[mid] < offset)
              low = mid + 1;
            else
              high = mid;
          }
          if (this.lineStarts[low] === offset)
            return { line: low + 1, col: 1 };
          if (low === 0)
            return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  }
});

// node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  "node_modules/yaml/dist/parse/parser.js"(exports) {
    "use strict";
    var node_process = __require("process");
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i)
        if (list[i].type === type)
          return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case "space":
          case "comment":
          case "newline":
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token) {
      switch (token?.type) {
        case "alias":
        case "scalar":
        case "single-quoted-scalar":
        case "double-quoted-scalar":
        case "flow-collection":
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case "document":
          return parent.start;
        case "block-map": {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case "block-seq":
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0)
        return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case "doc-start":
          case "explicit-key-ind":
          case "map-value-ind":
          case "seq-item-ind":
          case "newline":
            break loop;
        }
      }
      while (prev[++i]?.type === "space") {
      }
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5)
        Array.prototype.push.apply(target, source);
      else
        for (let i = 0; i < source.length; ++i)
          target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === "flow-seq-start") {
        for (const it of fc.items) {
          if (it.sep && !it.value && !includesToken(it.start, "explicit-key-ind") && !includesToken(it.sep, "map-value-ind")) {
            if (it.key)
              it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end)
                arrayPushArray(it.value.end, it.sep);
              else
                it.value.end = it.sep;
            } else
              arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = "";
        this.type = "";
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0)
          this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete))
          yield* this.next(lexeme);
        if (!incomplete)
          yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS)
          console.log("|", cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: "error", offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === "scalar") {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = "scalar";
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case "newline":
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine)
                this.onNewLine(this.offset + source.length);
              break;
            case "space":
              if (this.atNewLine && source[0] === " ")
                this.indent += source.length;
              break;
            case "explicit-key-ind":
            case "map-value-ind":
            case "seq-item-ind":
              if (this.atNewLine)
                this.indent += source.length;
              break;
            case "doc-mode":
            case "flow-error-end":
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0)
          yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === "doc-end" && top?.type !== "doc-end") {
          while (this.stack.length > 0)
            yield* this.pop();
          this.stack.push({
            type: "doc-end",
            offset: this.offset,
            source: this.source
          });
          return;
        }
        if (!top)
          return yield* this.stream();
        switch (top.type) {
          case "document":
            return yield* this.document(top);
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return yield* this.scalar(top);
          case "block-scalar":
            return yield* this.blockScalar(top);
          case "block-map":
            return yield* this.blockMap(top);
          case "block-seq":
            return yield* this.blockSequence(top);
          case "flow-collection":
            return yield* this.flowCollection(top);
          case "doc-end":
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token = error ?? this.stack.pop();
        if (!token) {
          const message = "Tried to pop an empty stack";
          yield { type: "error", offset: this.offset, source: "", message };
        } else if (this.stack.length === 0) {
          yield token;
        } else {
          const top = this.peek(1);
          if (token.type === "block-scalar") {
            token.indent = "indent" in top ? top.indent : 0;
          } else if (token.type === "flow-collection" && top.type === "document") {
            token.indent = 0;
          }
          if (token.type === "flow-collection")
            fixFlowSeqItems(token);
          switch (top.type) {
            case "document":
              top.value = token;
              break;
            case "block-scalar":
              top.props.push(token);
              break;
            case "block-map": {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token;
              } else {
                Object.assign(it, { key: token, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case "block-seq": {
              const it = top.items[top.items.length - 1];
              if (it.value)
                top.items.push({ start: [], value: token });
              else
                it.value = token;
              break;
            }
            case "flow-collection": {
              const it = top.items[top.items.length - 1];
              if (!it || it.value)
                top.items.push({ start: [], key: token, sep: [] });
              else if (it.sep)
                it.value = token;
              else
                Object.assign(it, { key: token, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token);
          }
          if ((top.type === "document" || top.type === "block-map" || top.type === "block-seq") && (token.type === "block-map" || token.type === "block-seq")) {
            const last = token.items[token.items.length - 1];
            if (last && !last.sep && !last.value && last.start.length > 0 && findNonEmptyIndex(last.start) === -1 && (token.indent === 0 || last.start.every((st) => st.type !== "comment" || st.indent < token.indent))) {
              if (top.type === "document")
                top.end = last.start;
              else
                top.items.push({ start: last.start });
              token.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case "directive-line":
            yield { type: "directive", offset: this.offset, source: this.source };
            return;
          case "byte-order-mark":
          case "space":
          case "comment":
          case "newline":
            yield this.sourceToken;
            return;
          case "doc-mode":
          case "doc-start": {
            const doc = {
              type: "document",
              offset: this.offset,
              start: []
            };
            if (this.type === "doc-start")
              doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: "error",
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source
        };
      }
      *document(doc) {
        if (doc.value)
          return yield* this.lineEnd(doc);
        switch (this.type) {
          case "doc-start": {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else
              doc.start.push(this.sourceToken);
            return;
          }
          case "anchor":
          case "tag":
          case "space":
          case "comment":
          case "newline":
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv)
          this.stack.push(bv);
        else {
          yield {
            type: "error",
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source
          };
        }
      }
      *scalar(scalar) {
        if (this.type === "map-value-ind") {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep5;
          if (scalar.end) {
            sep5 = scalar.end;
            sep5.push(this.sourceToken);
            delete scalar.end;
          } else
            sep5 = [this.sourceToken];
          const map = {
            type: "block-map",
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep: sep5 }]
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map;
        } else
          yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case "space":
          case "comment":
          case "newline":
            scalar.props.push(this.sourceToken);
            return;
          case "scalar":
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf("\n") + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf("\n", nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map) {
        const it = map.items[map.items.length - 1];
        switch (this.type) {
          case "newline":
            this.onKeyLine = false;
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case "space":
          case "comment":
            if (it.value) {
              map.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map.indent)) {
                const prev = map.items[map.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== "seq-item-ind";
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case "newline":
                  nl.push(i);
                  break;
                case "space":
                  break;
                case "comment":
                  if (st.indent > map.indent)
                    nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2)
              start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case "anchor":
            case "tag":
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case "explicit-key-ind":
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: "block-map",
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }]
                });
              }
              this.onKeyLine = true;
              return;
            case "map-value-ind":
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, "newline")) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: "block-map",
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }]
                    });
                  }
                } else if (it.value) {
                  map.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }]
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, "newline")) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep5 = it.sep;
                  sep5.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep: sep5 }]
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, "map-value-ind")) {
                  this.stack.push({
                    type: "block-map",
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }]
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map);
              if (bv) {
                if (bv.type === "block-seq") {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, "newline")) {
                    yield* this.pop({
                      type: "error",
                      offset: this.offset,
                      message: "Unexpected block-seq-ind on same line with key",
                      source: this.source
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case "newline":
            if (it.value) {
              const end = "end" in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === "comment")
                end?.push(this.sourceToken);
              else
                seq.items.push({ start: [this.sourceToken] });
            } else
              it.start.push(this.sourceToken);
            return;
          case "space":
          case "comment":
            if (it.value)
              seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case "anchor":
          case "tag":
            if (it.value || this.indent <= seq.indent)
              break;
            it.start.push(this.sourceToken);
            return;
          case "seq-item-ind":
            if (this.indent !== seq.indent)
              break;
            if (it.value || includesToken(it.start, "seq-item-ind"))
              seq.items.push({ start: [this.sourceToken] });
            else
              it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === "flow-error-end") {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === "flow-collection");
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case "comma":
            case "explicit-key-ind":
              if (!it || it.sep)
                fc.items.push({ start: [this.sourceToken] });
              else
                it.start.push(this.sourceToken);
              return;
            case "map-value-ind":
              if (!it || it.value)
                fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case "space":
            case "comment":
            case "newline":
            case "anchor":
            case "tag":
              if (!it || it.value)
                fc.items.push({ start: [this.sourceToken] });
              else if (it.sep)
                it.sep.push(this.sourceToken);
              else
                it.start.push(this.sourceToken);
              return;
            case "alias":
            case "scalar":
            case "single-quoted-scalar":
            case "double-quoted-scalar": {
              const fs = this.flowScalar(this.type);
              if (!it || it.value)
                fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep)
                this.stack.push(fs);
              else
                Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case "flow-map-end":
            case "flow-seq-end":
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv)
            this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (parent.type === "block-map" && (this.type === "map-value-ind" && parent.indent === fc.indent || this.type === "newline" && !parent.items[parent.items.length - 1].sep)) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === "map-value-ind" && parent.type !== "flow-collection") {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep5 = fc.end.splice(1, fc.end.length);
            sep5.push(this.sourceToken);
            const map = {
              type: "block-map",
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep: sep5 }]
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf("\n") + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf("\n", nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case "alias":
          case "scalar":
          case "single-quoted-scalar":
          case "double-quoted-scalar":
            return this.flowScalar(this.type);
          case "block-scalar-header":
            return {
              type: "block-scalar",
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: ""
            };
          case "flow-map-start":
          case "flow-seq-start":
            return {
              type: "flow-collection",
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: []
            };
          case "seq-item-ind":
            return {
              type: "block-seq",
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }]
            };
          case "explicit-key-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }]
            };
          }
          case "map-value-ind": {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: "block-map",
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }]
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== "comment")
          return false;
        if (this.indent <= indent)
          return false;
        return start.every((st) => st.type === "newline" || st.type === "space");
      }
      *documentEnd(docEnd) {
        if (this.type !== "doc-mode") {
          if (docEnd.end)
            docEnd.end.push(this.sourceToken);
          else
            docEnd.end = [this.sourceToken];
          if (this.type === "newline")
            yield* this.pop();
        }
      }
      *lineEnd(token) {
        switch (this.type) {
          case "comma":
          case "doc-start":
          case "doc-end":
          case "flow-seq-end":
          case "flow-map-end":
          case "map-value-ind":
            yield* this.pop();
            yield* this.step();
            break;
          case "newline":
            this.onKeyLine = false;
          // fallthrough
          case "space":
          case "comment":
          default:
            if (token.end)
              token.end.push(this.sourceToken);
            else
              token.end = [this.sourceToken];
            if (this.type === "newline")
              yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  }
});

// node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  "node_modules/yaml/dist/public-api.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document2 = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || prettyErrors && new lineCounter.LineCounter() || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0)
        return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument5(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc)
          doc = _doc;
        else if (doc.options.logLevel !== "silent") {
          doc.errors.push(new errors.YAMLParseError(_doc.range.slice(0, 2), "MULTIPLE_DOCS", "Source contains multiple documents; please use YAML.parseAllDocuments()"));
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === "function") {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === "object") {
        options = reviver;
      }
      const doc = parseDocument5(src, options);
      if (!doc)
        return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== "silent")
          throw doc.errors[0];
        else
          doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value, replacer, options) {
      let _replacer = null;
      if (typeof replacer === "function" || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === "string")
        options = options.length;
      if (typeof options === "number") {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined)
          return void 0;
      }
      if (identity.isDocument(value) && !_replacer)
        return value.toString(options);
      return new Document2.Document(value, _replacer, options).toString(options);
    }
    exports.parse = parse;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument5;
    exports.stringify = stringify;
  }
});

// node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  "node_modules/yaml/dist/index.js"(exports) {
    "use strict";
    var composer = require_composer();
    var Document2 = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document2.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  }
});

// src/bin.ts
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

// package.json
var version = "1.0.0-rc.2";

// src/core/errors.ts
var EXIT_ERROR = 1;
var DldError = class extends Error {
  exitCode;
  constructor(message, exitCode = EXIT_ERROR) {
    super(message);
    this.name = "DldError";
    this.exitCode = exitCode;
  }
};
var FsError = class extends DldError {
  code;
  constructor(operation, path, code) {
    super(`cannot ${operation} ${path}: ${code}`);
    this.name = "FsError";
    this.code = code;
  }
};
var GitCommandError = class extends DldError {
  stderr;
  /** git's exit status, when known. */
  status;
  constructor(args, stderr, status) {
    super(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
    this.name = "GitCommandError";
    this.stderr = stderr;
    this.status = status;
  }
};
var ToolNotFoundError = class extends DldError {
  tool;
  constructor(tool) {
    super(`${tool} is not installed or not on PATH`);
    this.name = "ToolNotFoundError";
    this.tool = tool;
  }
};
var GhCommandError = class extends DldError {
  stderr;
  constructor(args, stderr) {
    super(`gh ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
    this.name = "GhCommandError";
    this.stderr = stderr;
  }
};

// src/cli/command.ts
import { parseArgs } from "node:util";
var EXIT_OK = 0;
var EXIT_USAGE = 2;
var UsageError = class extends DldError {
  constructor(message) {
    super(message, EXIT_USAGE);
    this.name = "UsageError";
  }
};
var HelpRequested = class extends Error {
  constructor() {
    super("help requested");
    this.name = "HelpRequested";
  }
};
function parseCommandArgs(config) {
  if (requestsHelp(config)) throw new HelpRequested();
  try {
    return parseArgs(config);
  } catch (error) {
    if (error instanceof TypeError && "code" in error) throw new UsageError(error.message);
    throw error;
  }
}
function requestsHelp(config) {
  const { tokens } = parseArgs({
    ...config,
    options: { ...config.options, help: { type: "boolean", short: "h" } },
    strict: false,
    tokens: true
  });
  return tokens.some((token) => token.kind === "option" && token.name === "help");
}

// src/core/project.ts
import { join as join2 } from "node:path";

// src/core/config.ts
var import_yaml = __toESM(require_dist(), 1);
import { join } from "node:path";
var CONFIG_FILE = "dld.config.yaml";
function loadConfig(ctx, root) {
  const path = join(root, CONFIG_FILE);
  if (!ctx.fs.exists(path)) {
    throw new DldError(`${CONFIG_FILE} not found. Run /dld-init first.`);
  }
  return parseConfig(ctx.fs.readFile(path));
}
function parseConfig(text) {
  const doc = (0, import_yaml.parseDocument)(text, { logLevel: "silent" });
  const problem = doc.errors[0] ?? doc.warnings[0];
  if (problem !== void 0) throw invalid(`not valid YAML: ${problem.message}`);
  const raw = doc.toJS();
  if (!isRecord(raw)) throw invalid("expected a mapping of keys to values");
  const mode = raw.mode;
  if (mode !== "flat" && mode !== "namespaced") {
    throw invalid("'mode' must be 'flat' or 'namespaced'");
  }
  const namespaces = optionalStringList(raw.namespaces, "namespaces");
  if (mode === "namespaced" && namespaces.length === 0) {
    throw invalid("'namespaces' must list at least one namespace when 'mode' is 'namespaced'");
  }
  return {
    decisionsDir: requiredString(raw.decisions_dir, "decisions_dir"),
    mode,
    namespaces,
    annotationPrefix: optionalString(raw.annotation_prefix, "annotation_prefix") ?? "@decision",
    // @decision(DL-023)
    annotationExclude: repoRelativePatterns(raw.annotation_exclude, "annotation_exclude"),
    implementReview: optionalBoolean(raw.implement_review, "implement_review") ?? true,
    snapshotArtifacts: snapshotArtifacts(raw.snapshot_artifacts)
  };
}
function invalid(message) {
  return new DldError(`${CONFIG_FILE}: ${message}`);
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requiredString(value, key) {
  const result = optionalString(value, key);
  if (result === void 0) throw invalid(`'${key}' is required`);
  return result;
}
function optionalString(value, key) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "string" || value.trim() === "") {
    throw invalid(`'${key}' must be a non-empty string`);
  }
  return value;
}
function optionalBoolean(value, key) {
  if (value === void 0 || value === null) return void 0;
  if (typeof value !== "boolean") throw invalid(`'${key}' must be true or false`);
  return value;
}
function optionalStringList(value, key) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) throw invalid(`'${key}' must be a list of strings`);
  return value.map((item) => {
    if (typeof item !== "string" || item.trim() === "") {
      throw invalid(`'${key}' must be a list of non-empty strings`);
    }
    return item;
  });
}
function repoRelativePatterns(value, key) {
  const patterns = optionalStringList(value, key);
  const outside = patterns.find((pattern) => /^([/\\]|[A-Za-z]:|\.\.([/\\]|$))/.test(pattern));
  if (outside !== void 0) {
    throw invalid(`'${key}' patterns must be relative to the repository root, got '${outside}'`);
  }
  return patterns;
}
function snapshotArtifacts(value) {
  const key = "snapshot_artifacts";
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) throw invalid(`'${key}' must be a list of {title, prompt} entries`);
  return value.map((item) => {
    if (!isRecord(item)) throw invalid(`'${key}' entries must have 'title' and 'prompt'`);
    return {
      title: requiredString(item.title, `${key}[].title`),
      prompt: requiredString(item.prompt, `${key}[].prompt`)
    };
  });
}

// src/core/project.ts
function findProjectRoot(ctx) {
  try {
    return ctx.git(["rev-parse", "--show-toplevel"]).trim();
  } catch (error) {
    if (error instanceof GitCommandError) throw new DldError("not a git repository");
    throw error;
  }
}
function resolvePaths(root, config) {
  const decisionsDir = join2(root, config.decisionsDir);
  return { root, decisionsDir, recordsDir: join2(decisionsDir, "records") };
}
function loadProject(ctx) {
  const root = findProjectRoot(ctx);
  const config = loadConfig(ctx, root);
  return { config, paths: resolvePaths(root, config) };
}

// src/core/snapshot.ts
import { basename as basename3, join as join6, relative as relative3 } from "node:path";

// src/core/git.ts
import { relative, sep } from "node:path";
function gitAt(ctx, root) {
  return (...args) => ctx.git(["-C", root, ...args]);
}
function gitOrEmpty(git, ...args) {
  try {
    return git(...args);
  } catch (error) {
    if (error instanceof GitCommandError) return "";
    throw error;
  }
}
function nulSeparated(output) {
  return output.split("\0").filter((path) => path !== "");
}
function recordsPathspec(paths) {
  return relative(paths.root, paths.recordsDir).split(sep).join("/");
}
function decisionsPathspec(paths) {
  return relative(paths.root, paths.decisionsDir).split(sep).join("/");
}
var COMMIT_HASH = /^[0-9a-f]{4,64}$/i;
function resolveStateCommit(git, value) {
  if (value === void 0 || !COMMIT_HASH.test(value)) return void 0;
  return gitOrEmpty(git, "rev-parse", "--verify", "--quiet", `${value}^{commit}`) === "" ? void 0 : value;
}

// src/core/records.ts
var import_yaml2 = __toESM(require_dist(), 1);
import { basename, join as join3 } from "node:path";
var STATUSES = ["proposed", "accepted", "deprecated", "superseded"];
var RECORD_FILE = /^DL-(\d+)\.md$/;
var DECISION_ID = /^DL-\d+$/;
var DECISION_MENTION = /DL-\d+/g;
function isStatus(value) {
  return STATUSES.some((status) => status === value);
}
function listRecordFiles(ctx, recordsDir) {
  const found = [];
  const walk = (dir) => {
    const entries = ctx.fs.readDir(dir).sort((a, b) => a.name < b.name ? -1 : 1);
    for (const entry of entries) {
      const path = join3(dir, entry.name);
      if (entry.isDirectory) walk(path);
      else if (entry.isFile && RECORD_FILE.test(entry.name)) found.push(path);
    }
  };
  if (ctx.fs.isDirectory(recordsDir)) walk(recordsDir);
  return found;
}
function recordNumber(path) {
  const digits = RECORD_FILE.exec(basename(path))?.[1];
  if (digits === void 0) throw new Error(`not a decision record file: ${path}`);
  return Number.parseInt(digits, 10);
}
function findRecordFile(ctx, recordsDir, id) {
  return listRecordFiles(ctx, recordsDir).find((path) => basename(path) === `${id}.md`);
}
var isDelimiter = (line) => line === "---" || line === "---\r";
function frontmatterBlock(text) {
  const lines = text.split("\n");
  const start = lines.findIndex(isDelimiter);
  if (start === -1) return void 0;
  const end = lines.findIndex((line, index) => index > start && isDelimiter(line));
  if (end === -1) return void 0;
  return { lines, start, end };
}
function recordBody(text) {
  const block = frontmatterBlock(text);
  return block === void 0 ? text : block.lines.slice(block.end + 1).join("\n");
}
function parseRecord(text, source) {
  const invalid2 = (message) => new DldError(`${source}: ${message}`);
  const block = frontmatterBlock(text);
  if (block === void 0) throw invalid2("no frontmatter between --- lines");
  const frontmatter = block.lines.slice(block.start + 1, block.end).map((line) => line.replace(/\r$/, ""));
  const doc = (0, import_yaml2.parseDocument)(frontmatter.join("\n"), { logLevel: "silent" });
  const problem = doc.errors[0] ?? doc.warnings[0];
  const raw = problem === void 0 ? doc.toJS() : legacyFields(frontmatter);
  if (!isRecord2(raw)) throw invalid2("frontmatter must be a mapping");
  const string = (key) => {
    const value = raw[key];
    if (value === void 0 || value === null) return void 0;
    if (typeof value !== "string") throw invalid2(`'${key}' must be a string`);
    return value;
  };
  const required = (key) => {
    const value = string(key);
    if (value === void 0 || value === "") throw invalid2(`'${key}' is required`);
    return value;
  };
  const list = (key) => {
    const value = raw[key];
    if (value === void 0 || value === null) return [];
    if (!Array.isArray(value)) throw invalid2(`'${key}' must be a list`);
    return value.map((item) => {
      if (typeof item !== "string" && typeof item !== "number") {
        throw invalid2(`'${key}' must be a list of strings`);
      }
      return String(item);
    });
  };
  const status = required("status");
  if (!isStatus(status)) throw invalid2(`'status' must be one of: ${STATUSES.join(", ")}`);
  const timestamp = string("timestamp");
  const namespace = string("namespace");
  return {
    id: required("id"),
    title: required("title"),
    status,
    ...timestamp === void 0 ? {} : { timestamp },
    supersedes: list("supersedes"),
    amends: list("amends"),
    ...namespace === void 0 ? {} : { namespace },
    tags: list("tags"),
    references: references(raw.references, invalid2)
  };
}
function legacyFields(lines) {
  const fields = {};
  const lists = /* @__PURE__ */ new Set(["supersedes", "amends", "tags"]);
  for (const line of lines) {
    const match = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (match === null) continue;
    const [, key = "", rawValue = ""] = match;
    if (key in fields) continue;
    const value = rawValue.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    fields[key] = lists.has(key) ? value.replace(/^\[|\]$/g, "").split(",").map((item) => item.trim()).filter((item) => item !== "") : value;
  }
  delete fields.references;
  return fields;
}
function references(value, invalid2) {
  if (value === void 0 || value === null) return [];
  if (!Array.isArray(value)) throw invalid2("'references' must be a list");
  return value.map((item) => {
    if (!isRecord2(item) || typeof item.path !== "string") {
      throw invalid2("'references' entries must have a 'path'");
    }
    return typeof item.symbol === "string" ? { path: item.path, symbol: item.symbol } : { path: item.path };
  });
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function setStatus(text, status, source) {
  const block = frontmatterBlock(text);
  if (block === void 0) throw new DldError(`${source}: no frontmatter between --- lines`);
  const { lines, start, end } = block;
  let replaced = false;
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (line?.startsWith("status:")) {
      lines[i] = `status: ${status}${line.endsWith("\r") ? "\r" : ""}`;
      replaced = true;
    }
  }
  if (!replaced) throw new DldError(`${source}: frontmatter has no 'status' field`);
  return lines.join("\n");
}
function setId(text, oldId, newId) {
  const block = frontmatterBlock(text);
  if (block === void 0) return text;
  const { lines, start, end } = block;
  const idLine = new RegExp(`^id:[ \\t]*${oldId}(\\r?)$`);
  for (let i = start + 1; i < end; i++) {
    const line = lines[i];
    if (line !== void 0 && idLine.test(line)) lines[i] = line.replace(idLine, `id: ${newId}$1`);
  }
  return lines.join("\n");
}
var YAML_ESCAPES = {
  "\\": "\\\\",
  '"': '\\"',
  "\n": "\\n",
  "\r": "\\r",
  "	": "\\t"
};
function quoted(value) {
  const escaped = value.replace(/[\\"\x00-\x1f\x7f]/g, (char) => {
    return YAML_ESCAPES[char] ?? `\\x${char.charCodeAt(0).toString(16).padStart(2, "0")}`;
  });
  return `"${escaped}"`;
}
function renderNewRecord(record) {
  const lines = [
    "---",
    `id: ${record.id}`,
    `title: ${quoted(record.title)}`,
    `timestamp: ${record.timestamp}`,
    "status: proposed",
    `supersedes: [${record.supersedes}]`,
    `amends: [${record.amends}]`,
    ...record.namespace === void 0 ? [] : [`namespace: ${record.namespace}`],
    `tags: [${record.tags}]`,
    "references: []",
    "---",
    ""
  ];
  const body = record.body.replace(/\n+$/, "");
  if (body !== "") lines.push(body);
  return `${lines.join("\n")}
`;
}
function formatTimestamp(date) {
  return `${date.toISOString().slice(0, 19)}Z`;
}

// src/core/ids.ts
function formatId(n) {
  return `DL-${String(n).padStart(3, "0")}`;
}
function nextId(ctx, recordsDir) {
  const highest = listRecordFiles(ctx, recordsDir).map(recordNumber).reduce((max, n) => Math.max(max, n), 0);
  return formatId(highest + 1);
}

// src/core/state.ts
var import_yaml3 = __toESM(require_dist(), 1);
import { join as join5, relative as relative2 } from "node:path";

// src/core/files.ts
import { basename as basename2, dirname, join as join4 } from "node:path";
var TEMP_PREFIX = ".dld-tmp-";
function tempPathFor(path) {
  const suffix = Math.random().toString(36).slice(2, 10);
  return join4(dirname(path), `${TEMP_PREFIX}${basename2(path)}.${suffix}`);
}
function writeFileAtomic(ctx, path, content, mode) {
  const temp = tempPathFor(path);
  try {
    ctx.fs.writeFile(temp, content);
    if (mode !== void 0) ctx.fs.chmod(temp, mode);
    ctx.fs.rename(temp, path);
  } catch (error) {
    removeQuietly(ctx, temp);
    throw error;
  }
}
function createFileExclusive(ctx, path, content, existsMessage) {
  const temp = tempPathFor(path);
  try {
    ctx.fs.writeFile(temp, content);
    ctx.fs.link(temp, path);
  } catch (error) {
    if (error instanceof FsError && error.code === "EEXIST") throw new DldError(existsMessage);
    throw error;
  } finally {
    removeQuietly(ctx, temp);
  }
}
function removeQuietly(ctx, path) {
  try {
    ctx.fs.remove(path);
  } catch {
  }
}

// src/core/state.ts
var STATE_FILE = ".dld-state.yaml";
function statePath(paths) {
  return join5(paths.decisionsDir, STATE_FILE);
}
function loadStateDocument(ctx, paths) {
  const path = statePath(paths);
  if (!ctx.fs.exists(path)) return new import_yaml3.Document(void 0, { schema: "failsafe" });
  const source = relative2(paths.root, path);
  const doc = (0, import_yaml3.parseDocument)(ctx.fs.readFile(path), { schema: "failsafe", logLevel: "error" });
  const problem = doc.errors[0] ?? doc.warnings[0];
  if (problem !== void 0) throw new DldError(`${source}: not valid YAML: ${problem.message}`);
  if (doc.contents !== null && !(0, import_yaml3.isMap)(doc.contents)) {
    throw new DldError(`${source}: expected a mapping of sections`);
  }
  return doc;
}
function readStateSection(ctx, paths, section) {
  const value = loadStateDocument(ctx, paths).toJS()?.[section];
  return typeof value === "object" && value !== null && !Array.isArray(value) ? { ...value } : void 0;
}
function writeStateSection(ctx, paths, section, value) {
  const doc = loadStateDocument(ctx, paths);
  doc.set(section, value);
  writeFileAtomic(ctx, statePath(paths), String(doc));
}
function stateString(section, key) {
  const value = section?.[key];
  return typeof value === "string" && value !== "" ? value : void 0;
}
function shortHead(ctx, root) {
  try {
    return ctx.git(["-C", root, "rev-parse", "--short", "HEAD"]).trim();
  } catch (error) {
    if (error instanceof GitCommandError) return "unknown";
    throw error;
  }
}

// src/core/snapshot.ts
var DECISION_BOUNDARY = "===DLD_DECISION_BOUNDARY===";
var BUILT_IN_ARTIFACTS = ["SNAPSHOT.md", "OVERVIEW.md"];
function readRecords(ctx, { paths }) {
  return listRecordFiles(ctx, paths.recordsDir).map((path) => {
    const text = ctx.fs.readFile(path);
    const record = parseRecord(text, relative3(paths.root, path));
    return { path, number: recordNumber(path), text, accepted: record.status === "accepted" };
  }).sort((a, b) => a.number - b.number);
}
function collectActiveDecisions(ctx, project) {
  if (!ctx.fs.isDirectory(project.paths.recordsDir)) {
    throw new DldError(`records directory not found at ${project.paths.recordsDir}`);
  }
  return readRecords(ctx, project).filter((record) => record.accepted).map((record) => record.text).join(`${DECISION_BOUNDARY}
`);
}
function detectSnapshotChanges(ctx, project) {
  const { paths } = project;
  const state = readStateSection(ctx, paths, "snapshot");
  if (state === void 0) return { mode: "full" };
  if (BUILT_IN_ARTIFACTS.some((name) => !ctx.fs.exists(join6(paths.decisionsDir, name)))) {
    return { mode: "full" };
  }
  const included = stateString(state, "decisions_included");
  if (included === void 0 || !/^\d+$/.test(included)) return { mode: "full" };
  const includedNumber = Number.parseInt(included, 10);
  const newDecisions = readRecords(ctx, project).filter((record) => record.number > includedNumber && record.accepted).map((record) => formatId(record.number));
  const git = gitAt(ctx, paths.root);
  let stored = stateString(state, "commit_hash");
  const lastRun = stateString(state, "last_run");
  if ((stored === void 0 || stored === "unknown") && lastRun !== void 0) {
    stored = gitOrEmpty(git, "log", `--until=${lastRun}`, "--format=%h", "-1").trim() || void 0;
  }
  const commit = resolveStateCommit(git, stored);
  let modifiedDecisions = [];
  let commitRange = "";
  if (commit !== void 0 && commit !== shortHead(ctx, paths.root)) {
    commitRange = `${commit}..HEAD`;
    const numbers = nulSeparated(
      gitOrEmpty(git, "diff", "-z", "--name-only", commitRange, "--", recordsPathspec(paths))
    ).map((path) => basename3(path)).filter((name) => RECORD_FILE.test(name)).map((name) => recordNumber(name)).filter((number) => number <= includedNumber);
    modifiedDecisions = [...new Set(numbers)].sort((a, b) => a - b).map(formatId);
  }
  return { mode: "incremental", newDecisions, modifiedDecisions, commitRange };
}
function formatSnapshotChanges(changes) {
  if (changes.mode === "full") return "mode: full\n";
  return [
    "mode: incremental",
    `new_decisions: ${changes.newDecisions.join(", ")}`,
    `modified_decisions: ${changes.modifiedDecisions.join(", ")}`,
    `commit_range: ${changes.commitRange}`,
    ""
  ].join("\n");
}
function updateSnapshotState(ctx, project, customArtifacts) {
  const { paths } = project;
  const timestamp = formatTimestamp(ctx.now());
  const commit = shortHead(ctx, paths.root);
  const highest = readRecords(ctx, project).filter((record) => record.accepted).reduce((max, record) => Math.max(max, record.number), 0);
  const artifacts = /* @__PURE__ */ Object.create(null);
  for (const name of [...BUILT_IN_ARTIFACTS, ...customArtifacts]) artifacts[name] = timestamp;
  writeStateSection(ctx, paths, "snapshot", {
    last_run: timestamp,
    commit_hash: commit,
    decisions_included: String(highest),
    artifacts
  });
  return { timestamp, commit, highest };
}

// src/cli/commands/collect-active-decisions.ts
var collectActiveDecisionsCommand = {
  name: "collect-active-decisions",
  summary: "Print every accepted decision record",
  internal: true,
  usage: "Usage: dld collect-active-decisions\n\nPrint each accepted record in ID order, separated by ===DLD_DECISION_BOUNDARY=== lines.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    io.stdout(collectActiveDecisions(ctx, loadProject(ctx)));
    return EXIT_OK;
  }
};

// src/core/commit-reindex.ts
import { join as join7, posix as posix2 } from "node:path";

// src/core/reindex.ts
import { basename as basename4 } from "node:path";

// src/core/open-prs.ts
var GITHUB_REMOTE = /github\.com[:/]/;
var PR_LIMIT = "100";
function openPrIds(ctx, paths, base) {
  const skipped = (reason) => ({ ids: [], skipped: reason });
  try {
    ctx.gh(["--version"]);
  } catch (error) {
    if (error instanceof ToolNotFoundError) return skipped("gh CLI not installed");
    if (!(error instanceof GhCommandError)) throw error;
  }
  const git = gitAt(ctx, paths.root);
  if (!GITHUB_REMOTE.test(gitOrEmpty(git, "remote", "get-url", "origin"))) {
    return skipped("origin is not a GitHub remote");
  }
  try {
    ctx.gh(["auth", "status"]);
  } catch (error) {
    if (error instanceof GhCommandError) return skipped("gh not authenticated");
    throw error;
  }
  const prBase = base.startsWith("origin/") ? base.slice("origin/".length) : base;
  let output;
  try {
    output = ctx.gh([
      "pr",
      "list",
      "--state",
      "open",
      `--base=${prBase}`,
      "--json",
      "files,headRefName,isCrossRepository",
      "--limit",
      PR_LIMIT
    ]);
  } catch (error) {
    if (error instanceof GhCommandError) {
      return skipped(`gh pr list failed: ${firstLine(error.stderr) || "no error output"}`);
    }
    throw error;
  }
  const prs = parsePrList(output);
  if (prs === void 0) return skipped("gh pr list returned unexpected output");
  const current = gitOrEmpty(git, "rev-parse", "--abbrev-ref", "HEAD").trim();
  const prefix = `${recordsPathspec(paths)}/`;
  const ids = [];
  for (const pr of prs) {
    if (!pr.isCrossRepository && pr.headRefName === current) continue;
    for (const path of pr.files) {
      if (path.startsWith(prefix)) ids.push(...path.match(DECISION_MENTION) ?? []);
    }
  }
  return { ids };
}
function parsePrList(output) {
  let value;
  try {
    value = JSON.parse(output);
  } catch {
    return void 0;
  }
  if (!Array.isArray(value)) return void 0;
  const prs = [];
  for (const item of value) {
    if (!isObject(item)) return void 0;
    const files = Array.isArray(item.files) ? item.files : [];
    prs.push({
      headRefName: typeof item.headRefName === "string" ? item.headRefName : void 0,
      isCrossRepository: item.isCrossRepository === true,
      files: files.flatMap(
        (file) => isObject(file) && typeof file.path === "string" ? [file.path] : []
      )
    });
  }
  return prs;
}
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function firstLine(text) {
  return text.split("\n", 1)[0]?.trim() ?? "";
}

// src/core/reindex.ts
var DEFAULT_BASE = "origin/main";
var idNumber = (id) => Number.parseInt(id.slice(3), 10);
function compareIds(a, b) {
  return idNumber(a) - idNumber(b) || (a < b ? -1 : a > b ? 1 : 0);
}
function resolveBase(ctx) {
  const git = (...args) => ctx.git(args);
  const current = gitOrEmpty(git, "rev-parse", "--abbrev-ref", "HEAD").trim();
  const upstream = gitOrEmpty(
    git,
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{upstream}"
  ).trim();
  if (upstream !== "") {
    const slash = upstream.indexOf("/");
    const branch = slash === -1 ? upstream : upstream.slice(slash + 1);
    if (branch !== "" && branch !== current) return upstream;
  }
  return DEFAULT_BASE;
}
function verifyBase(ctx, paths, base, hint = "") {
  if (base.startsWith("-")) throw new DldError(`--base must be a git ref, got '${base}'`);
  const git = gitAt(ctx, paths.root);
  if (gitOrEmpty(git, "rev-parse", "--verify", "--quiet", `${base}^{commit}`) === "") {
    throw new DldError(`base ref '${base}' not found.${hint}`);
  }
}
function mergeBase(ctx, paths, base) {
  return gitAt(ctx, paths.root)("merge-base", base, "HEAD").trim();
}
function localAdditions(git, paths, base) {
  return nulSeparated(
    gitOrEmpty(
      git,
      "diff",
      "-z",
      "--name-only",
      "--diff-filter=A",
      `${base}...HEAD`,
      "--",
      recordsPathspec(paths)
    )
  );
}
function takenIds(ctx, paths, base) {
  const git = gitAt(ctx, paths.root);
  const onBase = nulSeparated(
    gitOrEmpty(git, "ls-tree", "-r", "-z", "--name-only", base, "--", recordsPathspec(paths))
  ).flatMap((path) => path.match(DECISION_MENTION) ?? []);
  const scan = openPrIds(ctx, paths, base);
  const ids = [.../* @__PURE__ */ new Set([...onBase, ...scan.ids])].sort(compareIds);
  return scan.skipped === void 0 ? { ids } : { ids, skipped: scan.skipped };
}
function listTakenIds(ctx, { paths }, base) {
  verifyBase(ctx, paths, base, " Fetch first or pass --base.");
  return takenIds(ctx, paths, base);
}
function collisionsOf(ctx, paths, base) {
  const added = localAdditions(gitAt(ctx, paths.root), paths, base);
  const local = added.flatMap((path) => {
    const id = basename4(path, ".md");
    return RECORD_FILE.test(basename4(path)) ? [{ path, id }] : [];
  });
  if (local.length === 0) return { collisions: [], localIds: [], taken: [] };
  const taken = takenIds(ctx, paths, base);
  const takenSet = new Set(taken.ids);
  const result = {
    collisions: local.filter(({ id }) => takenSet.has(id)),
    localIds: local.map(({ id }) => id),
    taken: taken.ids
  };
  return taken.skipped === void 0 ? result : { ...result, skipped: taken.skipped };
}
function findCollisions(ctx, { paths }, base) {
  verifyBase(ctx, paths, base);
  const { collisions, skipped } = collisionsOf(ctx, paths, base);
  return skipped === void 0 ? { collisions } : { collisions, skipped };
}
function planRenames(ctx, { paths }, base) {
  verifyBase(ctx, paths, base);
  const { collisions, localIds, taken, skipped } = collisionsOf(ctx, paths, base);
  const highest = [...taken, ...localIds].reduce((max, id) => Math.max(max, idNumber(id)), 0);
  const renames = [...collisions].sort((a, b) => compareIds(a.id, b.id) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map(({ path, id }, index) => ({ path, oldId: id, newId: formatId(highest + 1 + index) }));
  return skipped === void 0 ? { renames } : { renames, skipped };
}
function formatRename({ path, oldId, newId }) {
  return `${path}	${oldId}	${newId}`;
}

// src/core/rename-plan.ts
import { posix } from "node:path";
function renameProblem(paths, rename) {
  const { path, oldId, newId } = rename;
  if (!DECISION_ID.test(oldId) || !DECISION_ID.test(newId)) return "IDs must match DL-[0-9]+.";
  if (oldId === newId) return "old and new IDs are the same.";
  const segments = path.split("/");
  if (path.startsWith("/") || segments.some((s) => s === "" || s === "." || s === "..")) {
    return `path '${path}' must be relative to the project root, without '.' or '..' segments.`;
  }
  const records = recordsPathspec(paths);
  if (!path.startsWith(`${records}/`)) {
    return `path '${path}' is not under ${records}/.`;
  }
  if (posix.basename(path) !== `${oldId}.md`) {
    return `path '${path}' is not named ${oldId}.md.`;
  }
  return void 0;
}
function parseRenamePlan(paths, text) {
  const renames = [];
  const lineNumbers = [];
  const seen = { path: /* @__PURE__ */ new Set(), old: /* @__PURE__ */ new Set(), new: /* @__PURE__ */ new Set() };
  text.split("\n").forEach((raw, index) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.trim() === "") return;
    const fail = (message) => new DldError(`rename plan line ${index + 1}: ${message}`);
    const fields = line.split("	");
    const [path, oldId, newId] = fields;
    if (fields.length !== 3 || path === void 0 || oldId === void 0 || newId === void 0) {
      throw fail("expected <path>\\t<DL-OLD>\\t<DL-NEW>.");
    }
    const rename = { path, oldId, newId };
    const problem = renameProblem(paths, rename);
    if (problem !== void 0) throw fail(problem);
    if (seen.path.has(path)) throw fail(`path '${path}' appears more than once.`);
    if (seen.old.has(oldId)) throw fail(`${oldId} is renamed more than once.`);
    if (seen.new.has(newId)) throw fail(`${newId} is the target of more than one rename.`);
    seen.path.add(path);
    seen.old.add(oldId);
    seen.new.add(newId);
    renames.push(rename);
    lineNumbers.push(index + 1);
  });
  renames.forEach(({ newId }, index) => {
    if (seen.old.has(newId)) {
      throw new DldError(
        `rename plan line ${lineNumbers[index]}: ${newId} is both renamed and a rename target.`
      );
    }
  });
  return renames;
}

// src/core/commit-reindex.ts
var SUBJECT_LIST_LIMIT = 3;
function reindexMessage(renames, originalSubjects) {
  const pairs = renames.map(({ oldId, newId }) => `${oldId} -> ${newId}`);
  const subject = renames.length > SUBJECT_LIST_LIMIT ? `reindex ${renames.length} local decisions to avoid base-branch collisions` : `reindex local decisions: ${pairs.join(", ")}`;
  const message = `${subject}

Renames:
${pairs.map((pair) => `- ${pair}`).join("\n")}`;
  return originalSubjects === "" ? message : `${message}

Squashed from original branch commits:
${originalSubjects}`;
}
function commitReindex(ctx, { paths }, planText, base) {
  const git = gitAt(ctx, paths.root);
  verifyBase(ctx, paths, base);
  const renames = parseRenamePlan(paths, planText);
  if (renames.length === 0) throw new DldError("no rename plan on stdin.");
  const onto = mergeBase(ctx, paths, base);
  const head = git("rev-parse", "HEAD").trim();
  if (onto === head) throw new DldError("HEAD is already at the merge-base \u2014 nothing to squash.");
  const indexRel = posix2.join(decisionsPathspec(paths), "INDEX.md");
  const branchFiles = nulSeparated(
    git("diff", "-z", "--no-renames", "--name-only", "--diff-filter=AMRD", `${onto}..HEAD`)
  );
  const stage = /* @__PURE__ */ new Set();
  for (const { path, newId } of renames) {
    stage.add(path);
    stage.add(posix2.join(posix2.dirname(path), `${newId}.md`));
  }
  for (const file of branchFiles) if (file !== indexRel) stage.add(file);
  const subjects = git("log", "--reverse", "--format=- %s", `${onto}..HEAD`).replace(/\n+$/, "");
  const message = reindexMessage(renames, subjects);
  const indexFull = join7(paths.root, indexRel);
  if (ctx.fs.lexists(indexFull) && !ctx.fs.isRegularFile(indexFull)) {
    throw new DldError(`${indexRel} is not a regular file.`);
  }
  const saved = {
    head,
    tree: git("write-tree").trim(),
    index: ctx.fs.isRegularFile(indexFull) ? { bytes: ctx.fs.readBytes(indexFull), mode: ctx.fs.fileMode(indexFull) } : void 0
  };
  let stepName = "resetting to the merge-base";
  const step = (name, run2) => {
    stepName = name;
    return run2();
  };
  try {
    step("resetting to the merge-base", () => git("reset", "--quiet", onto));
    step(`restoring ${indexRel}`, () => {
      if (existsAtHead(git, indexRel)) {
        git("--literal-pathspecs", "checkout", "HEAD", "--", indexRel);
      } else {
        ctx.fs.remove(indexFull);
      }
    });
    for (const path of [...stage].sort()) {
      step(`staging ${path}`, () => stagePath(ctx, git, join7(paths.root, path), path));
    }
    step("checking the staged changes", () => {
      if (!hasStagedChanges(git)) {
        throw new DldError(
          "nothing to commit after squash. The reindex may have already been applied, or the plan didn't match the branch state."
        );
      }
    });
    step("committing", () => {
      try {
        git("commit", "--quiet", "-m", message);
      } catch (error) {
        if (error instanceof GitCommandError)
          throw new DldError(`git commit failed: ${error.stderr}`);
        throw error;
      }
    });
  } catch (error) {
    throw rollback(ctx, git, indexFull, saved, stepName, error);
  }
  return {
    commit: git("rev-parse", "--short", "HEAD").trim(),
    onto: git("rev-parse", "--short", onto).trim()
  };
}
function existsAtHead(git, path) {
  return git("--literal-pathspecs", "ls-tree", "-z", "HEAD", "--", path) !== "";
}
function stagePath(ctx, git, full, path) {
  const known = ctx.fs.lexists(full) || git("--literal-pathspecs", "ls-files", "-z", "--", path) !== "";
  if (known) git("--literal-pathspecs", "add", "-A", "--", path);
}
function hasStagedChanges(git) {
  try {
    git("diff", "--cached", "--quiet");
    return false;
  } catch (error) {
    if (error instanceof GitCommandError && error.status === 1) return true;
    throw error;
  }
}
function rollback(ctx, git, indexFull, saved, stepName, cause) {
  try {
    git("reset", "--quiet", "--soft", saved.head);
    git("read-tree", saved.tree);
    if (saved.index === void 0) ctx.fs.remove(indexFull);
    else writeFileAtomic(ctx, indexFull, saved.index.bytes, saved.index.mode);
  } catch (rollbackError) {
    return new DldError(
      `commit-reindex failed while ${stepName}: ${describe(cause)}
Rolling back also failed: ${describe(rollbackError)}
To restore by hand: git reset --soft ${saved.head} && git read-tree ${saved.tree}`
    );
  }
  if (!(cause instanceof DldError)) return cause;
  return new DldError(
    `commit-reindex failed while ${stepName}: ${cause.message}
The branch was restored to ${saved.head}.`,
    cause.exitCode
  );
}
function describe(error) {
  return error instanceof Error ? error.message : String(error);
}

// src/cli/commands/base-option.ts
function baseOption(value, fallback = DEFAULT_BASE) {
  const base = value ?? fallback;
  if (base.startsWith("-")) throw new UsageError(`--base must be a git ref, got '${base}'`);
  return base;
}
function skippedNotice(reason) {
  return `[dld-reindex] open PRs not scanned: ${reason}
`;
}

// src/cli/commands/commit-reindex.ts
var commitReindexCommand = {
  name: "commit-reindex",
  summary: "Squash the branch into one reindex commit",
  internal: true,
  usage: `Usage: dld commit-reindex --base <ref> < plan

Read a rename plan on standard input and squash the branch's commits since the merge-base
with <ref> into one reindex commit. INDEX.md is left at its merge-base state. On failure the
branch, index and INDEX.md are restored.

Options:
  --base <ref>  Base ref (required)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    if (!values.base) throw new DldError("--base is required.");
    const base = baseOption(values.base);
    const project = loadProject(ctx);
    const { commit, onto } = commitReindex(ctx, project, ctx.readStdin(), base);
    io.stdout(`Created reindex commit ${commit} on top of ${onto}
`);
    return EXIT_OK;
  }
};

// src/core/init.ts
import { join as join8 } from "node:path";
function parseMode(value) {
  if (value !== "flat" && value !== "namespaced") {
    throw new DldError(`mode must be 'flat' or 'namespaced', got '${value}'.`);
  }
  return value;
}
function renderConfig(mode, namespaces) {
  const lines = ["decisions_dir: decisions", `mode: ${mode}`];
  if (mode === "namespaced") lines.push("namespaces:", ...namespaces.map((ns) => `  - ${ns}`));
  lines.push("annotation_prefix: '@decision'");
  return `${lines.join("\n")}
`;
}
function createConfig(ctx, root, mode, namespaces) {
  if (mode === "namespaced" && namespaces.length === 0) {
    throw new DldError("namespaced mode requires at least one namespace.");
  }
  const path = join8(root, CONFIG_FILE);
  createFileExclusive(ctx, path, renderConfig(mode, namespaces), `${CONFIG_FILE} already exists.`);
  return path;
}
function createDirectories(ctx, { config, paths }) {
  ctx.fs.mkdir(paths.decisionsDir);
  ctx.fs.mkdir(paths.recordsDir);
  if (config.mode !== "namespaced") return;
  for (const namespace of config.namespaces) {
    const dir = join8(paths.recordsDir, namespace);
    ctx.fs.mkdir(dir);
    const keep = join8(dir, ".gitkeep");
    if (!ctx.fs.exists(keep)) createFileExclusive(ctx, keep, "", `${keep} already exists.`);
  }
}

// src/cli/commands/create-config.ts
var createConfigCommand = {
  name: "create-config",
  summary: "Create dld.config.yaml at the project root",
  internal: true,
  usage: "Usage: dld create-config <flat|namespaced> [namespace ...]\n\nCreate dld.config.yaml. Namespaced mode needs at least one namespace.\n",
  run(args, io, ctx) {
    const { positionals } = parseCommandArgs({
      args: [...args],
      options: {},
      allowPositionals: true
    });
    const [mode, ...namespaces] = positionals;
    if (mode === void 0) throw new UsageError("missing <flat|namespaced>");
    const path = createConfig(ctx, findProjectRoot(ctx), parseMode(mode), namespaces);
    io.stdout(`Created ${path}
`);
    return EXIT_OK;
  }
};

// src/core/decisions.ts
import { join as join9, relative as relative4 } from "node:path";
function updateStatus(ctx, project, id, status) {
  const path = findRecordFile(ctx, project.paths.recordsDir, id);
  if (path === void 0) throw new DldError(`decision ${id} not found.`);
  const text = ctx.fs.readFile(path);
  writeFileAtomic(ctx, path, setStatus(text, status, relative4(project.paths.root, path)));
  return path;
}
function createDecision(ctx, project, input) {
  if (!DECISION_ID.test(input.id)) {
    throw new DldError(`invalid decision ID '${input.id}'; expected DL-<digits>, e.g. DL-001.`);
  }
  const namespaced = project.config.mode === "namespaced" && input.namespace !== void 0;
  if (namespaced && !isSafeDirName(input.namespace ?? "")) {
    throw new DldError(`invalid namespace '${input.namespace}'.`);
  }
  const dir = namespaced ? join9(project.paths.recordsDir, input.namespace ?? "") : project.paths.recordsDir;
  ctx.fs.mkdir(dir);
  const path = join9(dir, `${input.id}.md`);
  const content = renderNewRecord({
    id: input.id,
    title: input.title,
    timestamp: formatTimestamp(ctx.now()),
    ...namespaced && input.namespace !== void 0 ? { namespace: input.namespace } : {},
    tags: input.tags,
    supersedes: input.supersedes,
    amends: input.amends,
    body: input.body
  });
  createFileExclusive(ctx, path, content, `${path} already exists.`);
  return path;
}
function isSafeDirName(name) {
  return name !== "." && name !== ".." && /^[A-Za-z0-9._-]+$/.test(name);
}

// src/cli/commands/create-decision.ts
var createDecisionCommand = {
  name: "create-decision",
  summary: "Create a proposed decision record",
  internal: true,
  usage: `Usage: dld create-decision --id <DL-NNN> --title <title> [options]

Create a decision record with status proposed and print its path.

Options:
  --id <DL-NNN>            Decision ID (required)
  --title <title>          Title (required)
  --namespace <name>       Namespace directory (namespaced projects only)
  --tags <a,b>             Comma-separated tags
  --supersedes <DL-X,...>  Decisions this one supersedes
  --amends <DL-X,...>      Decisions this one amends
  --body-stdin             Read the markdown body from standard input
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: {
        id: { type: "string" },
        title: { type: "string" },
        namespace: { type: "string" },
        tags: { type: "string" },
        supersedes: { type: "string" },
        amends: { type: "string" },
        "body-stdin": { type: "boolean" }
      }
    });
    const body = values["body-stdin"] === true ? ctx.readStdin() : "";
    const { id, title } = values;
    if (id === void 0 || id === "" || title === void 0 || title === "") {
      throw new DldError("--id and --title are required.");
    }
    const namespace = values.namespace === "" ? void 0 : values.namespace;
    const path = createDecision(ctx, loadProject(ctx), {
      id,
      title,
      ...namespace === void 0 ? {} : { namespace },
      tags: values.tags ?? "",
      supersedes: values.supersedes ?? "",
      amends: values.amends ?? "",
      body
    });
    io.stdout(`${path}
`);
    return EXIT_OK;
  }
};

// src/cli/commands/create-directories.ts
var createDirectoriesCommand = {
  name: "create-directories",
  summary: "Create the decisions directory structure from the config",
  internal: true,
  usage: "Usage: dld create-directories\n\nCreate the decisions and records directories, and one per namespace.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    createDirectories(ctx, loadProject(ctx));
    io.stdout("Created decisions directory structure.\n");
    return EXIT_OK;
  }
};

// src/core/index-file.ts
import { basename as basename5, join as join10, relative as relative5, sep as sep2 } from "node:path";
var INDEX_FILE = "INDEX.md";
function renderIndex(rows, mode) {
  const namespaced = mode === "namespaced";
  const lines = [
    "# Decision Log",
    "",
    namespaced ? "| ID | Title | Status | Namespace | Tags |" : "| ID | Title | Status | Tags |",
    namespaced ? "|----|-------|--------|-----------|------|" : "|----|-------|--------|------|"
  ];
  const sorted = [...rows].sort((a, b) => b.number - a.number);
  for (const { record } of sorted) {
    const cells = [record.id, record.title, record.status];
    if (namespaced) cells.push(record.namespace ?? "");
    cells.push(record.tags.join(", "));
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return `${lines.join("\n")}
`;
}
function indexPath(paths) {
  return join10(paths.decisionsDir, INDEX_FILE);
}
function collectIndexRows(ctx, paths, includeBase) {
  const localFiles = listRecordFiles(ctx, paths.recordsDir);
  const rows = localFiles.map((path) => ({
    number: recordNumber(path),
    record: parseRecord(ctx.fs.readFile(path), relative5(paths.root, path))
  }));
  if (includeBase === void 0) return rows;
  const git = (...args) => ctx.git(["-C", paths.root, ...args]);
  try {
    git("rev-parse", "--verify", "--quiet", `${includeBase}^{commit}`);
  } catch (error) {
    if (error instanceof GitCommandError) {
      throw new DldError(`--include-base ref '${includeBase}' not found.`);
    }
    throw error;
  }
  const localNames = new Set(localFiles.map((path) => basename5(path)));
  const recordsRel = relative5(paths.root, paths.recordsDir).split(sep2).join("/");
  const basePaths = git("ls-tree", "-r", "--name-only", includeBase, "--", recordsRel).split("\n").filter((path) => RECORD_FILE.test(basename5(path)) && !localNames.has(basename5(path)));
  for (const path of basePaths) {
    rows.push({
      number: recordNumber(path),
      record: parseRecord(git("show", `${includeBase}:${path}`), `${includeBase}:${path}`)
    });
  }
  return rows;
}
function writeIndex(ctx, paths, content) {
  writeFileAtomic(ctx, indexPath(paths), content);
}

// src/cli/commands/create-empty-index.ts
var createEmptyIndexCommand = {
  name: "create-empty-index",
  summary: "Write an INDEX.md with no decisions",
  internal: true,
  usage: "Usage: dld create-empty-index\n\nWrite INDEX.md in the decisions directory with only the table header.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    const { config, paths } = loadProject(ctx);
    writeIndex(ctx, paths, renderIndex([], config.mode));
    io.stdout(`Created ${indexPath(paths)}
`);
    return EXIT_OK;
  }
};

// src/cli/commands/detect-snapshot-changes.ts
var detectSnapshotChangesCommand = {
  name: "detect-snapshot-changes",
  summary: "Report what changed since the last snapshot",
  internal: true,
  usage: "Usage: dld detect-snapshot-changes\n\nPrint mode (full or incremental), new_decisions, modified_decisions and commit_range.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    io.stdout(formatSnapshotChanges(detectSnapshotChanges(ctx, loadProject(ctx))));
    return EXIT_OK;
  }
};

// src/core/annotations.ts
import { join as join11, relative as relative6, sep as sep3 } from "node:path";
var EXCLUDED_DIRS = /* @__PURE__ */ new Set([
  ".git",
  // Agent configuration directories, which hold installed skills.
  ".claude",
  ".agents",
  ".agent",
  ".codex",
  ".cursor",
  ".opencode",
  ".pi",
  ".tessl",
  "node_modules",
  "vendor",
  ".venv",
  "__pycache__",
  "target",
  "dist",
  "build",
  "out",
  ".next",
  ".gradle",
  "coverage"
]);
var EXCLUDED_FILE = /(\.lock|\.min\.js|\.min\.css|\.map)$/;
var BINARY_SNIFF_BYTES = 8192;
function scanOptionsFor({ config, paths }) {
  return {
    root: paths.root,
    decisionsDir: paths.decisionsDir,
    prefix: config.annotationPrefix,
    exclude: config.annotationExclude
  };
}
function listScannableFiles(ctx, options) {
  const output = ctx.git([
    "-C",
    options.root,
    "ls-files",
    "-z",
    "--cached",
    "--others",
    "--exclude-standard",
    // @decision(DL-023)
    "--",
    ...(options.exclude ?? []).map((pattern) => `:(exclude,glob)${pattern}`)
  ]);
  const decisionsRel = relative6(options.root, options.decisionsDir).split(sep3).join("/");
  const files = /* @__PURE__ */ new Set();
  for (const file of output.split("\0")) {
    if (file === "" || EXCLUDED_FILE.test(file)) continue;
    if (file === decisionsRel || file.startsWith(`${decisionsRel}/`)) continue;
    const dirs = file.split("/").slice(0, -1);
    if (dirs.some((dir) => EXCLUDED_DIRS.has(dir))) continue;
    files.add(file);
  }
  return [...files].sort();
}
function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function scanAnnotations(ctx, options) {
  const pattern = new RegExp(`${escapeRegExp(options.prefix)}\\((DL-\\d+)\\)`, "g");
  const found = [];
  for (const file of listScannableFiles(ctx, options)) {
    const path = join11(options.root, file);
    if (!ctx.fs.isRegularFile(path)) continue;
    const text = ctx.fs.readFile(path);
    if (text.slice(0, BINARY_SNIFF_BYTES).includes("\0")) continue;
    text.split("\n").forEach((content, index) => {
      for (const match of content.matchAll(pattern)) {
        if (match[1] !== void 0) found.push({ file, line: index + 1, id: match[1] });
      }
    });
  }
  return found;
}
function missingAnnotations(ctx, options, ids) {
  const annotated = new Set(scanAnnotations(ctx, options).map((annotation) => annotation.id));
  return ids.filter((id) => !annotated.has(id));
}
function formatAnnotation({ file, line, id }) {
  return `${file}:${line}:${id}`;
}

// src/cli/commands/find-annotations.ts
var findAnnotationsCommand = {
  name: "find-annotations",
  summary: "List every annotation in the codebase",
  internal: true,
  usage: "Usage: dld find-annotations\n\nPrint <file>:<line>:<DL-NNN> for every annotation, one per line.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    for (const annotation of scanAnnotations(ctx, scanOptionsFor(loadProject(ctx)))) {
      io.stdout(`${formatAnnotation(annotation)}
`);
    }
    return EXIT_OK;
  }
};

// src/cli/commands/find-collisions.ts
var findCollisionsCommand = {
  name: "find-collisions",
  summary: "List locally added decisions whose IDs are taken",
  internal: true,
  usage: `Usage: dld find-collisions [--base <ref>]

Print <path>\\t<DL-NNN> for each decision added on this branch whose ID is taken on the base
branch or in an open pull request.

Options:
  --base <ref>  Base ref (default: origin/main)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    const base = baseOption(values.base);
    const { collisions, skipped } = findCollisions(ctx, loadProject(ctx), base);
    for (const { path, id } of collisions) io.stdout(`${path}	${id}
`);
    if (skipped !== void 0) io.stderr(skippedNotice(skipped));
    return EXIT_OK;
  }
};

// src/core/audit.ts
import { basename as basename6, relative as relative7, sep as sep4 } from "node:path";
var MENTION = /DL-\d+/g;
var toPosix = (path) => path.split(sep4).join("/");
var idNumber2 = (id) => Number.parseInt(id.slice(3), 10);
function recordsChangedSinceAudit(ctx, { paths }) {
  const git = gitAt(ctx, paths.root);
  const stored = stateString(readStateSection(ctx, paths, "audit"), "commit_hash");
  const commit = resolveStateCommit(git, stored);
  if (commit === void 0) return void 0;
  const records = recordsPathspec(paths);
  return /* @__PURE__ */ new Set([
    ...nulSeparated(git("diff", "-z", "--name-only", commit, "--", records)),
    ...nulSeparated(git("ls-files", "-z", "--others", "--exclude-standard", "--", records))
  ]);
}
function findMissingAmends(ctx, project, { all }) {
  const { paths } = project;
  const changed = all ? void 0 : recordsChangedSinceAudit(ctx, project);
  const found = [];
  const files = listRecordFiles(ctx, paths.recordsDir).sort(
    (a, b) => recordNumber(a) - recordNumber(b)
  );
  for (const file of files) {
    const rel = toPosix(relative7(paths.root, file));
    if (changed !== void 0 && !changed.has(rel)) continue;
    const text = ctx.fs.readFile(file);
    const record = parseRecord(text, rel);
    const source = basename6(file, ".md");
    const declared = /* @__PURE__ */ new Set([...record.supersedes, ...record.amends]);
    const mentioned = new Set(recordBody(text).match(MENTION) ?? []);
    const refs = [...mentioned].filter((id) => id !== source && !declared.has(id)).sort((a, b) => idNumber2(a) - idNumber2(b));
    for (const referenced of refs) found.push({ source, referenced });
  }
  return found;
}
function updateAuditState(ctx, { paths }) {
  const timestamp = formatTimestamp(ctx.now());
  const commit = shortHead(ctx, paths.root);
  writeStateSection(ctx, paths, "audit", { last_run: timestamp, commit_hash: commit });
  return { timestamp, commit };
}

// src/cli/commands/find-missing-amends.ts
var findMissingAmendsCommand = {
  name: "find-missing-amends",
  summary: "List decision IDs mentioned in a body but not declared",
  internal: true,
  usage: `Usage: dld find-missing-amends [--all]

Print <source-id>:<referenced-id> for each decision ID a record's body mentions without
listing it in supersedes or amends. Only records changed since the last audit are checked.

Options:
  --all  Check every record
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { all: { type: "boolean" } } });
    const found = findMissingAmends(ctx, loadProject(ctx), { all: values.all === true });
    for (const { source, referenced } of found) io.stdout(`${source}:${referenced}
`);
    return EXIT_OK;
  }
};

// src/core/rename.ts
import { Buffer as Buffer2 } from "node:buffer";
import { join as join12, posix as posix3 } from "node:path";
var idPattern = (id, flags = "") => new RegExp(`${id}(?![0-9])`, flags);
function changedFiles(ctx, paths, commit) {
  return nulSeparated(
    gitAt(ctx, paths.root)(
      "diff",
      "-z",
      "--find-renames",
      "--name-only",
      "--diff-filter=AMR",
      commit
    )
  );
}
function rewriteFile(ctx, path, edit) {
  if (!ctx.fs.isRegularFile(path)) return;
  const bytes = ctx.fs.readBytes(path);
  if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return;
  const text = Buffer2.from(bytes).toString("latin1");
  const edited = edit(text);
  if (edited === text) return;
  writeFileAtomic(ctx, path, Buffer2.from(edited, "latin1"), ctx.fs.fileMode(path));
}
function renameDecision(ctx, project, rename, base) {
  const { paths, config } = project;
  const { path, oldId, newId } = rename;
  const problem = renameProblem(paths, rename);
  if (problem !== void 0) throw new DldError(problem);
  const full = join12(paths.root, path);
  if (!ctx.fs.isRegularFile(full)) throw new DldError(`${path} not found.`);
  const record = parseRecord(ctx.fs.readFile(full), path);
  if (record.id !== oldId) throw new DldError(`${path} has id ${record.id}, not ${oldId}.`);
  const newPath = posix3.join(posix3.dirname(path), `${newId}.md`);
  const newFull = join12(paths.root, newPath);
  if (ctx.fs.lexists(newFull)) throw new DldError(`${newPath} already exists.`);
  verifyBase(ctx, paths, base);
  const since = mergeBase(ctx, paths, base);
  const scannable = new Set(listScannableFiles(ctx, scanOptionsFor(project)));
  gitAt(ctx, paths.root)("mv", "--", path, newPath);
  const substitute = (text) => text.replace(idPattern(oldId, "g"), newId);
  rewriteFile(ctx, newFull, (text) => substitute(setId(text, oldId, newId)));
  const decisions = `${decisionsPathspec(paths)}/`;
  const prefix = Buffer2.from(config.annotationPrefix, "utf8").toString("latin1");
  const oldAnnotation = `${prefix}(${oldId})`;
  const newAnnotation = `${prefix}(${newId})`;
  for (const file of changedFiles(ctx, paths, since)) {
    if (file === newPath) continue;
    if (file.startsWith(decisions)) {
      rewriteFile(ctx, join12(paths.root, file), substitute);
    } else if (scannable.has(file)) {
      rewriteFile(
        ctx,
        join12(paths.root, file),
        (text) => text.split(oldAnnotation).join(newAnnotation)
      );
    }
  }
  return newPath;
}
function findStaleMentions(ctx, { paths }, planText, base) {
  const renames = parseRenamePlan(paths, planText);
  if (renames.length === 0) return [];
  verifyBase(ctx, paths, base);
  const decisions = `${decisionsPathspec(paths)}/`;
  const files = changedFiles(ctx, paths, mergeBase(ctx, paths, base)).flatMap((file) => {
    if (file.startsWith(decisions)) return [];
    const full = join12(paths.root, file);
    if (!ctx.fs.isRegularFile(full)) return [];
    const text = ctx.fs.readFile(full);
    if (text.slice(0, BINARY_SNIFF_BYTES).includes("\0")) return [];
    return [{ file, lines: text.split("\n").map((line) => line.replace(/\r$/, "")) }];
  });
  const found = [];
  for (const { oldId, newId } of renames) {
    const pattern = idPattern(oldId);
    for (const { file, lines } of files) {
      lines.forEach((text, index) => {
        if (pattern.test(text)) found.push({ file, line: index + 1, oldId, newId, text });
      });
    }
  }
  return found;
}
function formatStaleMention({ file, line, oldId, newId, text }) {
  return `${file}	${line}	${oldId}	${newId}	${text}`;
}

// src/cli/commands/find-stale-mentions.ts
var findStaleMentionsCommand = {
  name: "find-stale-mentions",
  summary: "List remaining mentions of renamed decision IDs",
  internal: true,
  usage: `Usage: dld find-stale-mentions --base <ref> < plan

Read a rename plan (<path>\\t<DL-OLD>\\t<DL-NEW> per line) on standard input and print
<path>\\t<line>\\t<DL-OLD>\\t<DL-NEW>\\t<text> for each remaining DL-OLD mention in changed
files outside the decisions directory.

Options:
  --base <ref>  Base ref for the local change set (required)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    if (!values.base) throw new DldError("--base is required.");
    const base = baseOption(values.base);
    const project = loadProject(ctx);
    for (const mention of findStaleMentions(ctx, project, ctx.readStdin(), base)) {
      io.stdout(`${formatStaleMention(mention)}
`);
    }
    return EXIT_OK;
  }
};

// src/cli/commands/init.ts
import { join as join17, relative as relative8 } from "node:path";

// src/generate/harnesses.ts
import { join as join13 } from "node:path";

// src/generate/template.ts
var import_yaml4 = __toESM(require_dist(), 1);
var TEMPLATE_FIELDS = ["name", "description", "compatibility", "internal"];
function parseTemplate(text, skill, source) {
  const fail = (line, message) => new DldError(`${source}:${line}: ${message}`);
  if (text.includes("\r")) throw fail(1, "must use LF line endings, not CRLF");
  const lines = text.split("\n");
  if (lines[0] !== "---") throw fail(1, "must start with a --- frontmatter line");
  const end = lines.indexOf("---", 1);
  if (end === -1) throw fail(1, "frontmatter has no closing --- line");
  const doc = (0, import_yaml4.parseDocument)(lines.slice(1, end).join("\n"), { logLevel: "silent" });
  const problem = doc.errors[0];
  if (problem !== void 0) {
    const line = 1 + (problem.linePos?.[0].line ?? 1);
    throw fail(line, `frontmatter is not valid YAML: ${problem.message.split("\n", 1)[0]}`);
  }
  const values = doc.toJS();
  const raw = {};
  let internal = false;
  for (let i = 1; i < end; i++) {
    const line = lines[i] ?? "";
    const key = /^([a-z_]+):/.exec(line)?.[1];
    if (key === void 0 || !isField(key)) {
      throw fail(
        i + 1,
        `unexpected frontmatter line; allowed fields: ${TEMPLATE_FIELDS.join(", ")}`
      );
    }
    const value = isRecord3(values) ? values[key] : void 0;
    if (key === "internal") {
      if (typeof value !== "boolean") throw fail(i + 1, "'internal' must be true or false");
      internal = value;
    } else {
      if (typeof value !== "string" || value === "") {
        throw fail(i + 1, `'${key}' must be a single-line string`);
      }
      raw[key] = line;
    }
  }
  if (raw.name === void 0 || raw.description === void 0) {
    throw fail(1, "frontmatter needs 'name' and 'description'");
  }
  const name = isRecord3(values) ? values.name : void 0;
  if (name !== skill) {
    const line = lines.findIndex((l, i) => i > 0 && i < end && l.startsWith("name:")) + 1;
    throw fail(line, `name '${String(name)}' must match the directory '${skill}'`);
  }
  for (let i = end + 1; i < lines.length; i++) {
    const rewritten = HARNESS_TEMPLATING.exec(lines[i] ?? "")?.[0];
    if (rewritten !== void 0) {
      throw fail(
        i + 1,
        `'${rewritten}' is rewritten by some harnesses' skill loaders; rephrase it`
      );
    }
  }
  return {
    skill,
    source,
    lines: raw,
    internal,
    body: lines.slice(end + 1).join("\n"),
    bodyLine: end + 2
  };
}
var HARNESS_TEMPLATING = /\$ARGUMENTS|\$\d|!`/;
var BUNDLED_CLI = { skill: "dld-common", path: "scripts/dld.mjs" };
var PLACEHOLDER_START = /\{\{\s*(?:script|dld)/g;
var SCRIPT = /\{\{script ([a-z0-9-]+)\/([A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*)\}\}/y;
var DLD = /\{\{dld(-setup)?\}\}/y;
function renderBody(template, renderers) {
  const { body } = template;
  let out = "";
  let last = 0;
  let usesDld = false;
  for (const start of body.matchAll(PLACEHOLDER_START)) {
    const at = start.index;
    const line = template.bodyLine + (body.slice(0, at).match(/\n/g)?.length ?? 0);
    const fail = (message) => new DldError(`${template.source}:${line}: ${message}`);
    DLD.lastIndex = at;
    const dld = DLD.exec(body);
    if (dld !== null) {
      if (!renderers.exists(BUNDLED_CLI)) {
        throw fail(`{{dld}} needs the bundled CLI at ${BUNDLED_CLI.skill}/${BUNDLED_CLI.path}`);
      }
      usesDld = true;
      out += body.slice(last, at) + (dld[1] === void 0 ? renderers.dld() : renderers.dldSetup());
      last = at + dld[0].length;
      continue;
    }
    SCRIPT.lastIndex = at;
    const [text, skill, path] = SCRIPT.exec(body) ?? [];
    if (text === void 0 || skill === void 0 || path === void 0) {
      throw fail(
        "malformed placeholder; expected {{script <skill>/<path>}}, {{dld}} or {{dld-setup}}"
      );
    }
    if (path.split("/").some((segment) => segment === "." || segment === "..")) {
      throw fail(`placeholder path '${skill}/${path}' must not contain '.' or '..'`);
    }
    const ref = { skill, path };
    if (!renderers.exists(ref)) throw fail(`no template provides ${skill}/${path}`);
    out += body.slice(last, at) + renderers.script(ref);
    last = at + text.length;
  }
  return { body: out + body.slice(last), usesDld };
}
function isField(key) {
  return TEMPLATE_FIELDS.some((field) => field === key);
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/generate/adapters.ts
var relativeRef = (fromSkill, { skill, path }) => skill === fromSkill ? path : `../${skill}/${path}`;
var SETUP = "The commands below run the `dld` CLI bundled with the dld-common skill, and need Node.js 20+.";
var agentSkillsAdapter = {
  id: "agent-skills",
  outputDir: "skills",
  fields: ["name", "description", "compatibility"],
  extraFrontmatter: [],
  dldFrontmatter: [],
  scriptRef: relativeRef,
  dld: (fromSkill) => `node "<skill-dir>/${relativeRef(fromSkill, BUNDLED_CLI)}"`,
  dldSetup: (fromSkill) => `${SETUP} \`<skill-dir>\` stands for the absolute path of this skill's directory. If \`<skill-dir>/${relativeRef(fromSkill, BUNDLED_CLI)}\` does not exist, stop and tell the user to install the dld-common skill: \`npx skills add jimutt/dld-kit --skill dld-common\`.`,
  internalManifest: true
};
var CLAUDE_CLI = `\${CLAUDE_SKILL_DIR}/../${BUNDLED_CLI.skill}/${BUNDLED_CLI.path}`;
var claudeCodeAdapter = {
  id: "claude-code",
  outputDir: ".claude/skills",
  fields: ["name", "description"],
  extraFrontmatter: [],
  dldFrontmatter: [`allowed-tools: Bash(node "${CLAUDE_CLI}" *)`],
  scriptRef: (_fromSkill, { skill, path }) => `\${CLAUDE_SKILL_DIR}/../${skill}/${path}`,
  dld: () => `node "${CLAUDE_CLI}"`,
  dldSetup: () => `\`\${CLAUDE_SKILL_DIR}\` is the absolute path of this skill's directory. ${SETUP} If \`${CLAUDE_CLI}\` does not exist, stop and tell the user to reinstall dld-kit's skills, including dld-common.`,
  internalManifest: false
};

// src/generate/harnesses.ts
var CLAUDE_LAYOUT = {
  id: "claude",
  adapter: claudeCodeAdapter,
  dir: ".claude/skills"
};
var AGENTS_LAYOUT = {
  id: "agents",
  adapter: agentSkillsAdapter,
  dir: ".agents/skills"
};
var LAYOUTS = [CLAUDE_LAYOUT, AGENTS_LAYOUT];
var HARNESSES = [
  {
    name: "claude",
    title: "Claude Code",
    layout: CLAUDE_LAYOUT,
    rule: "claude-file",
    markers: [".claude", "CLAUDE.md"],
    // @decision(DL-054) @decision(DL-055)
    instructions: ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md", "AGENTS.md"]
  },
  {
    name: "antigravity",
    title: "Antigravity",
    layout: AGENTS_LAYOUT,
    rule: "agents-file",
    markers: [".agents/rules", ".agent", "GEMINI.md"],
    instructions: ["AGENTS.md"]
  },
  {
    name: "codex",
    title: "Codex",
    layout: AGENTS_LAYOUT,
    rule: "block",
    markers: [".codex"],
    instructions: ["AGENTS.md"]
  },
  {
    name: "cursor",
    title: "Cursor",
    layout: AGENTS_LAYOUT,
    rule: "block",
    markers: [".cursor"],
    // @decision(DL-061)
    instructions: ["AGENTS.md", "CLAUDE.md"],
    readsAll: true
  },
  {
    name: "opencode",
    title: "OpenCode",
    layout: AGENTS_LAYOUT,
    rule: "block",
    markers: [".opencode", "opencode.json", "opencode.jsonc"],
    // @decision(DL-061) OpenCode 2.x; 1.x also fell back to CLAUDE.md.
    instructions: ["AGENTS.md"]
  },
  {
    name: "pi",
    title: "Pi",
    layout: AGENTS_LAYOUT,
    rule: "block",
    markers: [".pi"],
    instructions: ["AGENTS.md", "CLAUDE.md"]
  }
];
var GENERIC_MARKERS = ["AGENTS.md", ".agents/skills"];
var HARNESS_NAMES = HARNESSES.map((harness) => harness.name);
function findHarness(name) {
  return HARNESSES.find((harness) => harness.name === name);
}
function detectHarnesses(ctx, root) {
  const found = (marker) => ctx.fs.lexists(join13(root, marker));
  const detected = [];
  for (const harness of HARNESSES) {
    const marker = harness.markers.find(found);
    if (marker !== void 0) detected.push({ harness, marker });
  }
  const generic = GENERIC_MARKERS.find(found);
  const agentsLayoutFound = detected.some(({ harness }) => harness.layout === AGENTS_LAYOUT);
  const codex = findHarness("codex");
  if (generic !== void 0 && !agentsLayoutFound && codex !== void 0) {
    detected.push({ harness: codex, marker: generic });
    detected.sort((a, b) => HARNESSES.indexOf(a.harness) - HARNESSES.indexOf(b.harness));
  }
  return detected;
}
function targetsFor(harnesses) {
  return {
    layouts: new Set(harnesses.map((harness) => harness.layout)),
    rules: new Set(harnesses.map((harness) => harness.rule))
  };
}

// src/generate/install.ts
import { dirname as dirname4, join as join16 } from "node:path";

// src/generate/generate.ts
import { dirname as dirname2, join as join14 } from "node:path";
var MANIFEST = "SKILL.md";
var normalMode = (mode) => mode & 73 ? 493 : 420;
function listFiles(ctx, dir, other = () => {
}, prefix = "") {
  if (!ctx.fs.isDirectory(dir)) return [];
  const found = [];
  for (const entry of ctx.fs.readDir(dir).sort((a, b) => a.name < b.name ? -1 : 1)) {
    if (entry.name.startsWith(".")) continue;
    const rel = `${prefix}${entry.name}`;
    if (entry.isDirectory) {
      found.push(...listFiles(ctx, join14(dir, entry.name), other, `${rel}/`));
    } else {
      if (!entry.isFile) other(rel);
      found.push(rel);
    }
  }
  return found;
}
var utf8 = new TextDecoder("utf-8", { fatal: true });
function readSupportingFile(ctx, path, source) {
  try {
    return utf8.decode(ctx.fs.readBytes(path));
  } catch (error) {
    if (error instanceof TypeError) throw new DldError(`${source}: not UTF-8 text`);
    throw error;
  }
}
function manifest(template, adapter, { body, usesDld }, version2) {
  const fields = adapter.fields.flatMap((field) => template.lines[field] ?? []);
  return [
    "---",
    ...fields,
    ...adapter.extraFrontmatter,
    ...usesDld ? adapter.dldFrontmatter : [],
    "metadata:",
    `  dld-kit-version: "${version2}"`,
    "---",
    `<!-- Generated by dld-kit from ${template.source}. Do not edit: updating the skills overwrites this file. -->`,
    body
  ].join("\n");
}
function generateSkills(ctx, templatesDir, adapter, version2, { sourceDir = "templates/skills", extraFiles = /* @__PURE__ */ new Map() } = {}) {
  const skills = ctx.fs.readDir(templatesDir).filter((entry) => entry.isDirectory && !entry.name.startsWith(".")).map((entry) => entry.name).sort();
  const provided = /* @__PURE__ */ new Set();
  const support = /* @__PURE__ */ new Map();
  for (const skill of skills) {
    const files = listFiles(ctx, join14(templatesDir, skill), (rel) => {
      throw new DldError(`${sourceDir}/${skill}/${rel}: templates must be regular files`);
    }).filter((file) => file !== MANIFEST);
    support.set(skill, files);
    for (const file of files) provided.add(`${skill}/${file}`);
  }
  for (const path of extraFiles.keys()) {
    if (provided.has(path)) throw new DldError(`${sourceDir}/${path}: also generated; remove it`);
    provided.add(path);
  }
  const output = /* @__PURE__ */ new Map();
  for (const skill of skills) {
    const path = join14(templatesDir, skill, MANIFEST);
    const source = `${sourceDir}/${skill}/${MANIFEST}`;
    const template = parseTemplate(ctx.fs.readFile(path), skill, source);
    const rendered = renderBody(template, {
      exists: (ref) => provided.has(`${ref.skill}/${ref.path}`),
      script: (ref) => adapter.scriptRef(skill, ref),
      dld: () => adapter.dld(skill),
      dldSetup: () => adapter.dldSetup(skill)
    });
    if (!template.internal || adapter.internalManifest) {
      output.set(`${skill}/${MANIFEST}`, {
        content: manifest(template, adapter, rendered, version2),
        mode: 420
      });
    }
    for (const file of support.get(skill) ?? []) {
      const full = join14(templatesDir, skill, file);
      output.set(`${skill}/${file}`, {
        content: readSupportingFile(ctx, full, `${sourceDir}/${skill}/${file}`),
        mode: normalMode(ctx.fs.fileMode(full))
      });
    }
  }
  for (const [path, file] of extraFiles) output.set(path, { ...file, mode: normalMode(file.mode) });
  return new Map([...output].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
}
function ownedSkill(path, files, generated) {
  const skill = path.split("/", 1)[0] ?? "";
  return generated.has(skill) || skill.startsWith("dld-") || files.has(path);
}
function diffOutput(ctx, dir, files) {
  const generated = new Set([...files.keys()].map((path) => path.split("/", 1)[0] ?? ""));
  const existing = new Set(
    listFiles(ctx, dir).filter((path) => ownedSkill(path, files, generated))
  );
  const diff = { changed: [], missing: [], extra: [] };
  for (const [path, file] of files) {
    const full = join14(dir, path);
    if (!existing.has(path) || !ctx.fs.isRegularFile(full)) diff.missing.push(path);
    else if (ctx.fs.readFile(full) !== file.content || normalMode(ctx.fs.fileMode(full)) !== file.mode) {
      diff.changed.push(path);
    }
  }
  diff.extra = [...existing].filter((path) => !files.has(path)).sort();
  return diff;
}
function writeOutput(ctx, dir, files) {
  const diff = diffOutput(ctx, dir, files);
  for (const path of diff.extra) ctx.fs.remove(join14(dir, path));
  for (const path of [...diff.missing, ...diff.changed]) {
    const file = files.get(path);
    if (file === void 0) continue;
    const full = join14(dir, path);
    ctx.fs.mkdir(join14(full, ".."));
    if (ctx.fs.lexists(full) && !ctx.fs.isRegularFile(full)) ctx.fs.remove(full);
    writeFileAtomic(ctx, full, file.content, file.mode);
  }
  removeEmptyParents(ctx, dir, diff.extra);
  return diff;
}
function removeEmptyParents(ctx, dir, paths) {
  const parents = /* @__PURE__ */ new Set();
  for (const path of paths) {
    for (let parent = dirname2(path); parent !== "."; parent = dirname2(parent)) parents.add(parent);
  }
  const deepestFirst = [...parents].sort((a, b) => b.split("/").length - a.split("/").length);
  for (const parent of deepestFirst) {
    const full = join14(dir, parent);
    if (ctx.fs.isDirectory(full) && ctx.fs.readDir(full).length === 0) ctx.fs.removeDir(full);
  }
}

// src/generate/rule.ts
import { dirname as dirname3, join as join15, posix as posix4 } from "node:path";

// templates/rules/dld-workflow.md
var dld_workflow_default = "# DLD (Decision-Linked Development)\n\nThis project uses Decision-Linked Development. Decision records (DL-*.md) live in the `records/` subdirectory of the decisions directory set in `dld.config.yaml` (`decisions/` by default). High-level docs (INDEX.md, OVERVIEW.md, SNAPSHOT.md) live in the decisions directory.\n\n## Rules\n\n- When you encounter `@decision(DL-XXX)` annotations in code, read the referenced decision with the dld-lookup skill BEFORE modifying the annotated code.\n- ALWAYS look up and verify related decisions before modifying annotated code. Do not skip this step.\n- NEVER modify code in a way that contradicts an existing decision without first confirming with the user. If the change requires breaking a previous decision, a new decision must be recorded (with the dld-decide skill) that explicitly supersedes the old one. If it only partially modifies a previous decision, record it as an amendment instead.\n\n## Skills\n\n- dld-decide: record a new decision\n- dld-plan: break down a feature into multiple grouped decisions\n- dld-implement: implement proposed decisions\n- dld-lookup: query decisions by ID, tag, or code path\n- dld-adjust: adjust or update existing decisions\n- dld-audit: scan for drift between decisions and code\n- dld-snapshot: regenerate SNAPSHOT.md and OVERVIEW.md from the decision log\n- dld-status: a quick overview of the decision log state\n- dld-retrofit: generate decisions from an existing codebase\n- dld-reindex: resolve decision-ID collisions with the base branch (and open PRs) before rebasing\n";

// src/generate/rule.ts
var RULE_TEXT = dld_workflow_default;
var RULE_SOURCE = "templates/rules/dld-workflow.md";
var CLAUDE_RULE_FILE = ".claude/rules/dld-workflow.md";
var AGENTS_RULE_FILE = ".agents/rules/dld-workflow.md";
var CLAUDE_IMPORT_FILE = ".claude/CLAUDE.md";
var BLOCK_START = "<!-- dld-kit:start -->";
var BLOCK_END = "<!-- dld-kit:end -->";
var AGENTS_MD = "AGENTS.md";
var CLAUDE_MD = "CLAUDE.md";
var CLAUDE_FILES = [CLAUDE_MD, CLAUDE_IMPORT_FILE, "CLAUDE.local.md"];
var SHARED_CLAUDE_FILES = [CLAUDE_MD, CLAUDE_IMPORT_FILE];
var RULE_FILES = {
  "claude-file": CLAUDE_RULE_FILE,
  "agents-file": AGENTS_RULE_FILE
};
function notice(version2, what) {
  return `<!-- Generated by dld-kit ${version2} from ${RULE_SOURCE}. Do not edit: updating the rule overwrites this ${what}. -->`;
}
var STAMP = /<!-- Generated by dld-kit (\S+) from /;
function ruleVersion(content) {
  return STAMP.exec(content)?.[1];
}
function renderRuleFile(channel, text, version2) {
  const frontmatter = channel === "agents-file" ? "---\ntrigger: always_on\n---\n" : "";
  return `${frontmatter}${notice(version2, "file")}

${text}`;
}
function renderImportFile(version2) {
  return `<!-- Generated by dld-kit ${version2} for Claude Code: it loads AGENTS.md, which holds the DLD rule, through the import below. Do not edit: updating the rule overwrites this file. -->

@../AGENTS.md
`;
}
var IMPORT_STAMP = /^<!-- Generated by dld-kit (\S+) for Claude Code:/;
function importFileVersion(content) {
  return IMPORT_STAMP.exec(content)?.[1];
}
function renderBlock(text, version2) {
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  return [BLOCK_START, notice(version2, "block"), "", ...body.split("\n"), BLOCK_END];
}
function findBlock(content, file) {
  const starts = [];
  const ends = [];
  let offset = 0;
  for (const line of content.split("\n")) {
    const text = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (text === BLOCK_START) starts.push(offset);
    if (text === BLOCK_END) ends.push(offset);
    offset += line.length + 1;
  }
  if (starts.length === 0 && ends.length === 0) return void 0;
  const [from] = starts;
  const [end] = ends;
  if (starts.length !== 1 || ends.length !== 1 || from === void 0 || end === void 0) {
    throw malformed(file);
  }
  if (end < from) throw malformed(file);
  return { from, to: end + BLOCK_END.length };
}
function malformed(file) {
  return new DldError(
    `${file}: expected one '${BLOCK_START}' line followed by one '${BLOCK_END}' line; fix the dld-kit markers by hand`
  );
}
function upsertBlock(content, block, file) {
  const eol = content.includes("\r\n") ? "\r\n" : "\n";
  const rendered = block.join(eol);
  const span = findBlock(content, file);
  if (span !== void 0) return content.slice(0, span.from) + rendered + content.slice(span.to);
  if (content === "") return rendered + eol;
  const separator = content.endsWith("\n") ? eol : eol + eol;
  return content + separator + rendered + eol;
}
function planRule(ctx, root, channels, version2, { harnesses = [] } = {}, text = RULE_TEXT) {
  const plan = { writes: [], removals: [], warnings: [] };
  const regular = (file) => ctx.fs.isRegularFile(join15(root, file));
  const read = (file) => regular(file) ? ctx.fs.readFile(join15(root, file)) : "";
  const resolved = (file) => {
    const full = join15(root, file);
    return ctx.fs.exists(full) ? ctx.fs.realPath(full) : full;
  };
  let blockFiles = [AGENTS_MD, CLAUDE_MD].filter(
    (file) => regular(file) && findBlock(read(file), file) !== void 0
  );
  if (blockFiles.length === 0 && channels.has("block")) {
    const targets = harnesses.filter((h) => h.rule === "block");
    const file = blockPlacement(ctx, root, targets);
    blockFiles = [file];
    plan.warnings.push(...switchWarnings(ctx, root, file, targets));
  }
  const pending = /* @__PURE__ */ new Map();
  for (const file of blockFiles) {
    const content = read(file);
    const updated = upsertBlock(content, renderBlock(text, version2), file);
    pending.set(file, updated);
    if (updated !== content) plan.writes.push({ path: file, content: updated });
  }
  const linkedDir = symlinkedPart(ctx, root, dirname3(CLAUDE_IMPORT_FILE));
  const ownsImport = linkedDir === void 0 && importFileVersion(read(CLAUDE_IMPORT_FILE)) !== void 0;
  const wantsImport = channels.has("claude-file") && blockFiles.includes(AGENTS_MD) && !SHARED_CLAUDE_FILES.some((file) => ctx.fs.lexists(join15(root, file)));
  if (ownsImport || wantsImport && linkedDir === void 0) {
    const content = renderImportFile(version2);
    pending.set(CLAUDE_IMPORT_FILE, content);
    if (read(CLAUDE_IMPORT_FILE) !== content) {
      plan.writes.push({ path: CLAUDE_IMPORT_FILE, content });
    }
  } else if (wantsImport) {
    plan.warnings.push(
      `${linkedDir} is a symlink, so dld-kit does not write ${CLAUDE_IMPORT_FILE}, which would import AGENTS.md for Claude Code. Claude Code reads the rule block in AGENTS.md by itself only while the project has no CLAUDE.md, ${CLAUDE_IMPORT_FILE} or CLAUDE.local.md.`
    );
  }
  const withBlock = new Set(blockFiles.map(resolved));
  const current = projectView(ctx, root);
  const view = {
    exists: (file) => pending.has(file) || current.exists(file),
    read: (file) => pending.get(file) ?? current.read(file)
  };
  const reads = (harness) => instructionFiles(harness, view)[0];
  const readsBlock = (harness) => instructionFiles(harness, view).some((file) => withBlock.has(resolved(file)));
  const ownerOf = (channel) => HARNESSES.find((h) => h.rule === channel);
  const loadsBlock = (channel) => {
    const owner = ownerOf(channel);
    return owner !== void 0 && readsBlock(owner);
  };
  if (blockFiles.length > 0) {
    plan.warnings.push(
      ...blindWarnings(
        blockFiles,
        harnesses.filter((h) => h.rule === "block" && !readsBlock(h)),
        reads
      )
    );
  }
  for (const channel of ["claude-file", "agents-file"]) {
    const path = RULE_FILES[channel];
    if (loadsBlock(channel)) {
      if (ctx.fs.lexists(join15(root, path))) plan.removals.push(path);
    } else if (channels.has(channel)) {
      refuseSymlinkedDir(ctx, root, dirname3(path));
      const content = renderRuleFile(channel, text, version2);
      if (read(path) !== content) plan.writes.push({ path, content });
    }
  }
  const ruleInstalled = blockFiles.length > 0 || channels.size > 0;
  plan.warnings.push(...legacyBlockWarnings(read(CLAUDE_MD), ruleInstalled));
  return plan;
}
function projectView(ctx, root) {
  const exists = (file) => ctx.fs.exists(join15(root, file));
  return {
    exists,
    read: (file) => exists(file) && !ctx.fs.isDirectory(join15(root, file)) ? ctx.fs.readFile(join15(root, file)) : ""
  };
}
function instructionFiles(harness, view) {
  if (harness.name !== "claude") {
    if (harness.readsAll) return harness.instructions.filter((f) => view.exists(f));
    const file = harness.instructions.find((f) => view.exists(f));
    return file === void 0 ? [] : [file];
  }
  const files = CLAUDE_FILES.filter((file) => view.exists(file));
  if (files.length === 0) return view.exists(AGENTS_MD) ? [AGENTS_MD] : [];
  const imported = files.some((file) => importsAgentsMd(view.read(file), file));
  return imported && view.exists(AGENTS_MD) ? [...files, AGENTS_MD] : files;
}
var FENCE = /^ {0,3}(`{3,}|~{3,})/;
function importsAgentsMd(content, file) {
  const dir = posix4.dirname(file);
  let fence;
  for (const line of content.split(/\r?\n/)) {
    const marker = FENCE.exec(line)?.[1];
    if (marker !== void 0) {
      if (fence === void 0) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = void 0;
      continue;
    }
    if (fence !== void 0) continue;
    const prose = line.replace(/`[^`]*`/g, "");
    for (const match of prose.matchAll(/(?:^|\s)@(\S+)/g)) {
      const target = match[1];
      if (target !== void 0 && posix4.normalize(posix4.join(dir, target)) === AGENTS_MD) {
        return true;
      }
    }
  }
  return false;
}
function blindWarnings(blockFiles, blind, reads) {
  const byFile = /* @__PURE__ */ new Map();
  for (const harness of blind) {
    const file = reads(harness) ?? harness.instructions[0] ?? AGENTS_MD;
    byFile.set(file, [...byFile.get(file) ?? [], harness]);
  }
  return [...byFile].map(([file, harnesses]) => {
    const names = harnesses.map((h) => h.title).join(" and ");
    const one = harnesses.length === 1;
    return `The dld-kit rule block is in ${blockFiles.join(" and ")}, but ${names} ${one ? "reads" : "read"} ${file}. To cover ${one ? "it" : "them"}, move the block (the dld-kit:start line through the dld-kit:end line) into ${file}, then run dld install-rule.`;
  });
}
function blockPlacement(ctx, root, targets) {
  if (ctx.fs.isRegularFile(join15(root, AGENTS_MD))) return AGENTS_MD;
  const agentsLinked = ctx.fs.lexists(join15(root, AGENTS_MD));
  if (ctx.fs.isRegularFile(join15(root, CLAUDE_MD)) && (agentsLinked || targets.every((h) => h.instructions.includes(CLAUDE_MD)))) {
    return CLAUDE_MD;
  }
  if (agentsLinked) {
    throw new DldError(
      `${AGENTS_MD} is not a regular file (a symlink?); dld-kit does not edit through it. Point it at a regular file or add the dld-kit block by hand.`
    );
  }
  return AGENTS_MD;
}
function switchWarnings(ctx, root, file, targets) {
  if (file !== AGENTS_MD || ctx.fs.lexists(join15(root, AGENTS_MD))) return [];
  if (!ctx.fs.lexists(join15(root, CLAUDE_MD))) return [];
  const switching = targets.filter((h) => !h.readsAll && h.instructions.includes(CLAUDE_MD));
  if (switching.length === 0) return [];
  const names = switching.map((h) => h.title).join(" and ");
  return [
    `dld-kit creates AGENTS.md for the rule block, because not every selected agent reads CLAUDE.md. ${names} will read AGENTS.md instead of CLAUDE.md from now on, so move anything ${switching.length === 1 ? "it needs" : "they need"} from CLAUDE.md into AGENTS.md.`
  ];
}
var LEGACY_HEADING = /^## DLD \(Decision-Linked Development\)\s*$/;
function legacyBlockWarnings(claudeMd, ruleInstalled) {
  const span = findBlock(claudeMd, CLAUDE_MD);
  const outside = span === void 0 ? claudeMd : claudeMd.slice(0, span.from) + claudeMd.slice(span.to);
  if (!outside.split(/\r?\n/).some((line) => LEGACY_HEADING.test(line))) return [];
  const section = "CLAUDE.md has a '## DLD (Decision-Linked Development)' section from an older dld-init.";
  return [
    ruleInstalled ? `${section} dld-kit now installs the rule separately, so that section can be removed.` : `${section} Install the rule with dld install-rule --agent <name> before removing it.`
  ];
}
function loadsRule(ctx, root, harness) {
  if (harness.rule !== "block" && ctx.fs.exists(join15(root, RULE_FILES[harness.rule]))) {
    return true;
  }
  const view = projectView(ctx, root);
  return instructionFiles(harness, view).some(
    (file) => view.read(file).split(/\r?\n/).some((line) => line === BLOCK_START || LEGACY_HEADING.test(line))
  );
}
function sessionContext(ctx, root, harness, text = RULE_TEXT) {
  if (!ctx.fs.exists(join15(root, CONFIG_FILE))) return void 0;
  return loadsRule(ctx, root, harness) ? void 0 : text;
}
function symlinkedPart(ctx, root, dir) {
  let current = "";
  for (const part of dir.split("/")) {
    current = current === "" ? part : `${current}/${part}`;
    const full = join15(root, current);
    if (!ctx.fs.lexists(full)) return void 0;
    if (!ctx.fs.exists(full) || ctx.fs.realPath(full) !== join15(ctx.fs.realPath(root), current)) {
      return current;
    }
  }
  return void 0;
}
function refuseSymlinkedDir(ctx, root, dir) {
  const linked = symlinkedPart(ctx, root, dir);
  if (linked !== void 0) {
    throw new DldError(
      `${linked} is a symlink; dld-kit does not install through symlinks. Replace it with a directory (dld-kit keeps each agent's copy separate).`
    );
  }
}
function installedRuleChannels(ctx, root) {
  const channels = /* @__PURE__ */ new Set();
  for (const channel of ["claude-file", "agents-file"]) {
    if (ctx.fs.lexists(join15(root, RULE_FILES[channel]))) channels.add(channel);
  }
  if (importFileVersion(projectView(ctx, root).read(CLAUDE_IMPORT_FILE)) !== void 0) {
    channels.add("claude-file");
  }
  for (const file of [AGENTS_MD, CLAUDE_MD]) {
    const path = join15(root, file);
    if (ctx.fs.isRegularFile(path) && findBlock(ctx.fs.readFile(path), file) !== void 0) {
      channels.add("block");
    }
  }
  return channels;
}
function installedRuleStamps(ctx, root) {
  const stamps = [];
  const regular = (file) => ctx.fs.isRegularFile(join15(root, file));
  for (const file of [CLAUDE_RULE_FILE, AGENTS_RULE_FILE].filter(regular)) {
    stamps.push({ path: file, version: ruleVersion(ctx.fs.readFile(join15(root, file))) });
  }
  const imported = importFileVersion(projectView(ctx, root).read(CLAUDE_IMPORT_FILE));
  if (imported !== void 0) stamps.push({ path: CLAUDE_IMPORT_FILE, version: imported });
  for (const file of [AGENTS_MD, CLAUDE_MD].filter(regular)) {
    const content = ctx.fs.readFile(join15(root, file));
    const span = findBlock(content, file);
    if (span !== void 0) {
      stamps.push({ path: file, version: ruleVersion(content.slice(span.from, span.to)) });
    }
  }
  return stamps;
}
function applyRulePlan(ctx, root, plan) {
  for (const { path, content } of plan.writes) {
    const full = join15(root, path);
    ctx.fs.mkdir(dirname3(full));
    if (ctx.fs.lexists(full) && !ctx.fs.isRegularFile(full)) ctx.fs.remove(full);
    writeFileAtomic(ctx, full, content);
  }
  for (const path of plan.removals) {
    const full = join15(root, path);
    ctx.fs.remove(full);
    if (ctx.fs.isDirectory(dirname3(full)) && ctx.fs.readDir(dirname3(full)).length === 0) {
      ctx.fs.removeDir(dirname3(full));
    }
  }
}

// src/generate/install.ts
function packageSource(ctx, cliPath2, command) {
  const templatesDir = join16(dirname4(cliPath2), "..", "templates", "skills");
  if (!ctx.fs.isDirectory(templatesDir)) {
    throw new DldError(
      `dld ${command} installs skills from the dld-kit npm package, but this copy of dld (${cliPath2}) has no templates beside it. Run it from the package instead: npx dld-kit@latest ${command}`
    );
  }
  return { templatesDir, cli: ctx.fs.readFile(cliPath2) };
}
var isOwned = (name) => name.startsWith("dld-");
function ownedSkills(ctx, root, layout) {
  const dir = join16(root, layout.dir);
  if (!ctx.fs.isDirectory(dir)) return [];
  return ctx.fs.readDir(dir).filter((entry) => !entry.isFile && isOwned(entry.name)).map((entry) => entry.name).sort();
}
function refuseSymlinkedSkills(ctx, root, layout) {
  const dir = join16(root, layout.dir);
  if (!ctx.fs.isDirectory(dir)) return;
  const linked = ctx.fs.readDir(dir).filter((entry) => isOwned(entry.name) && !entry.isDirectory && !entry.isFile).map((entry) => `${layout.dir}/${entry.name}`).sort();
  if (linked.length === 0) return;
  throw new DldError(
    `${linked.join(", ")} ${linked.length === 1 ? "is a symlink" : "are symlinks"}, so another installer, such as npx skills, manages these skills. Update them with npx skills update, or remove them and run this command again. To set up DLD without touching them, run the dld-init skill or dld install-rule.`
  );
}
var SKILLS_LOCK = "skills-lock.json";
function skillsLockWarning(ctx, root) {
  const path = join16(root, SKILLS_LOCK);
  if (!ctx.fs.isRegularFile(path)) return [];
  let skills;
  try {
    skills = JSON.parse(ctx.fs.readFile(path))?.skills;
  } catch {
    return [];
  }
  if (typeof skills !== "object" || skills === null) return [];
  const listed = Object.keys(skills).filter(isOwned).sort();
  if (listed.length === 0) return [];
  return [
    `${SKILLS_LOCK} lists ${listed.join(", ")}: npx skills manages those skills, so dld update and npx skills update overwrite each other's copies. Update them with one of the two.`
  ];
}
function installedLayouts(ctx, root) {
  return LAYOUTS.filter((layout) => ownedSkills(ctx, root, layout).length > 0);
}
function installedTargets(ctx, root) {
  const layouts = new Set(installedLayouts(ctx, root));
  const rules = installedRuleChannels(ctx, root);
  if (layouts.has(CLAUDE_LAYOUT)) rules.add("claude-file");
  return { layouts, rules };
}
function missingAgentsRuleWarning({ layouts, rules }) {
  if (!layouts.has(AGENTS_LAYOUT) || rules.has("block") || rules.has("agents-file")) return [];
  return [
    `${AGENTS_LAYOUT.dir} has the DLD skills, but no agent reading it has the always-on rule. Run dld install-rule --agent <name> (antigravity, codex, cursor, opencode or pi).`
  ];
}
var SKILL_STAMP = /^ {2}dld-kit-version: "?([^"\n]+)"?$/m;
function installedStamps(ctx, root) {
  const stamps = [];
  for (const layout of LAYOUTS) {
    for (const skill of ownedSkills(ctx, root, layout)) {
      const path = `${layout.dir}/${skill}/SKILL.md`;
      if (!ctx.fs.isRegularFile(join16(root, path))) continue;
      stamps.push({ path, version: SKILL_STAMP.exec(ctx.fs.readFile(join16(root, path)))?.[1] });
    }
  }
  return [...stamps, ...installedRuleStamps(ctx, root)];
}
var SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
function compareVersions(a, b) {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (pa === null || pb === null) return void 0;
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return Math.sign(diff);
  }
  const [preA, preB] = [pa[4], pb[4]];
  if (preA === preB) return 0;
  if (preA === void 0) return 1;
  if (preB === void 0) return -1;
  return comparePrerelease(preA.split("."), preB.split("."));
}
function comparePrerelease(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const [x, y] = [a[i] ?? "", b[i] ?? ""];
    if (x === y) continue;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny) return Math.sign(Number(x) - Number(y));
    if (nx !== ny) return nx ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
}
function checkDowngrade(stamps, version2) {
  const newer = stamps.filter(
    (stamp) => stamp.version !== void 0 && (compareVersions(stamp.version, version2) ?? 0) > 0
  );
  if (newer.length === 0) return;
  const list = newer.map((stamp) => `  ${stamp.path} (${stamp.version})`).join("\n");
  throw new DldError(
    `these files were installed by a newer dld-kit than this one (${version2}):
${list}
Upgrade dld-kit, or pass --force to replace them with ${version2}.`
  );
}
function planInstall(ctx, root, request) {
  const layouts = LAYOUTS.filter((layout) => request.layouts.has(layout));
  for (const layout of layouts) {
    refuseSymlinkedDir(ctx, root, layout.dir);
    refuseSymlinkedSkills(ctx, root, layout);
  }
  if (!request.force) checkDowngrade(installedStamps(ctx, root), request.version);
  const skills = layouts.map((layout) => {
    const { source } = request;
    if (source === void 0) throw new DldError("installing skills needs the skill templates");
    const cli = /* @__PURE__ */ new Map([
      [`${BUNDLED_CLI.skill}/${BUNDLED_CLI.path}`, { content: source.cli, mode: 493 }]
    ]);
    const files = generateSkills(ctx, source.templatesDir, layout.adapter, request.version, {
      extraFiles: cli
    });
    return { layout, files };
  });
  const rule = planRule(ctx, root, request.rules, request.version, {
    harnesses: request.harnesses
  });
  const warnings = layouts.length > 0 ? skillsLockWarning(ctx, root) : [];
  return { skills, rule, warnings };
}
function applyInstall(ctx, root, plan) {
  const skills = plan.skills.map(({ layout, files }) => {
    const diff = writeOutput(ctx, join16(root, layout.dir), files);
    const written = diff.changed.length + diff.missing.length;
    return {
      dir: layout.dir,
      written,
      removed: diff.extra.length,
      unchanged: files.size - written
    };
  });
  applyRulePlan(ctx, root, plan.rule);
  return {
    skills,
    ruleWritten: plan.rule.writes.map((write) => write.path),
    ruleRemoved: plan.rule.removals,
    warnings: [...plan.warnings, ...plan.rule.warnings]
  };
}

// src/cli/install.ts
var AGENT_HELP = `Agents: ${HARNESS_NAMES.join(", ")}. --agent takes a comma-separated list and can be repeated.`;
function parseAgents(values) {
  const names = (values ?? []).flatMap((value) => value.split(",")).map((name) => name.trim());
  const harnesses = /* @__PURE__ */ new Set();
  for (const name of names) {
    if (name === "") continue;
    const harness = findHarness(name);
    if (harness === void 0) {
      throw new UsageError(`unknown agent '${name}'; expected one of: ${HARNESS_NAMES.join(", ")}`);
    }
    harnesses.add(harness);
  }
  return HARNESSES.filter((harness) => harnesses.has(harness));
}
async function selectHarnesses(io, detected, requested, yes) {
  const selected = /* @__PURE__ */ new Set([...detected.map((d) => d.harness), ...requested]);
  const ordered = () => HARNESSES.filter((harness) => selected.has(harness));
  if (io.prompt === void 0 || yes) {
    if (selected.size === 0) {
      throw new UsageError(
        `no agent detected in this project; name them with --agent (${HARNESS_NAMES.join(", ")})`
      );
    }
    return ordered();
  }
  const found = new Map(detected.map((d) => [d.harness, d.marker]));
  const width = Math.max(...HARNESS_NAMES.map((name) => name.length));
  for (; ; ) {
    const lines = HARNESSES.map((harness, i) => {
      const box = selected.has(harness) ? "[x]" : "[ ]";
      const marker = found.get(harness);
      const note = marker === void 0 ? "" : ` (found ${marker})`;
      return `  ${i + 1}. ${box} ${harness.name.padEnd(width)}  ${harness.title}${note}
`;
    });
    io.stdout(`Install DLD for these agents:
${lines.join("")}`);
    const answer = (await io.prompt("Numbers to toggle, or Enter to continue: ")).trim();
    if (answer === "") {
      if (selected.size > 0) return ordered();
      io.stdout("Select at least one agent.\n");
      continue;
    }
    const picks = answer.split(/[\s,]+/).map((pick) => HARNESSES[Number(pick) - 1]);
    if (picks.some((harness) => harness === void 0)) {
      io.stdout(`Enter numbers from 1 to ${HARNESSES.length}.
`);
      continue;
    }
    for (const harness of picks) {
      if (harness === void 0) continue;
      if (selected.has(harness)) selected.delete(harness);
      else selected.add(harness);
    }
  }
}
function cliPath(io) {
  if (io.cliPath === void 0) throw new DldError("cannot locate the running dld file");
  return io.cliPath;
}
function printReport(io, report2) {
  for (const { dir, written, removed, unchanged } of report2.skills) {
    io.stdout(`${dir}: ${written} written, ${removed} removed, ${unchanged} unchanged
`);
  }
  for (const path of report2.ruleWritten) {
    io.stdout(
      path === CLAUDE_IMPORT_FILE ? `Wrote ${path} (imports AGENTS.md for Claude Code)
` : `Wrote the DLD rule to ${path}
`
    );
  }
  for (const path of report2.ruleRemoved) io.stdout(`Removed ${path} (the rule is in the block)
`);
  for (const warning of report2.warnings) io.stderr(`Warning: ${warning}
`);
}

// src/cli/commands/init.ts
var initCommand = {
  name: "init",
  summary: "Set up DLD, its skills and the always-on rule in this repository",
  usage: `Usage: dld init [--namespaces <a,b,...>] [--agent <names>] [--yes] [--force]

Create dld.config.yaml, the decisions directory and INDEX.md, then install the DLD skills and
the always-on rule for the agents used in this project.

Agents are detected from the project; --agent adds more. On an interactive terminal, init asks
you to confirm the selection unless --yes is given.

Options:
  --namespaces <a,b>  Organise decisions by these namespaces (default: one flat log)
  --agent <names>     Agents to install for, besides the detected ones
  --yes               Do not ask; use the detected agents and --agent
  --force             Replace DLD skills installed by a newer dld-kit

${AGENT_HELP}
`,
  async run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: {
        namespaces: { type: "string" },
        agent: { type: "string", multiple: true },
        yes: { type: "boolean" },
        force: { type: "boolean" }
      }
    });
    const requested = parseAgents(values.agent);
    const namespaces = (values.namespaces ?? "").split(",").map((name) => name.trim()).filter((name) => name !== "");
    if (values.namespaces !== void 0 && namespaces.length === 0) {
      throw new UsageError("--namespaces needs at least one namespace");
    }
    const root = findProjectRoot(ctx);
    if (ctx.fs.lexists(join17(root, CONFIG_FILE))) {
      throw new DldError(
        `DLD is already set up here (${CONFIG_FILE} exists). Run dld update to refresh the skills and rule, or dld update --agent <name> to add an agent.`
      );
    }
    const source = packageSource(ctx, cliPath(io), "init");
    const harnesses = await selectHarnesses(
      io,
      detectHarnesses(ctx, root),
      requested,
      values.yes === true
    );
    const targets = targetsFor(harnesses);
    const plan = planInstall(ctx, root, {
      source,
      layouts: targets.layouts,
      rules: targets.rules,
      version,
      force: values.force === true,
      harnesses
    });
    createConfig(ctx, root, namespaces.length > 0 ? "namespaced" : "flat", namespaces);
    const project = loadProject(ctx);
    createDirectories(ctx, project);
    writeIndex(ctx, project.paths, renderIndex([], project.config.mode));
    const report2 = applyInstall(ctx, root, plan);
    const index = relative8(root, indexPath(project.paths));
    io.stdout(`Created ${CONFIG_FILE} and ${index}
`);
    printReport(io, report2);
    io.stdout(
      `
DLD is set up for: ${harnesses.map((harness) => harness.name).join(", ")}. Commit these files so everyone gets the same skills and rule.
Next, in your agent: the dld-retrofit skill records decisions from existing code, and dld-decide records a new one.
`
    );
    return EXIT_OK;
  }
};

// src/cli/commands/install-rule.ts
var installRuleCommand = {
  name: "install-rule",
  summary: "Install the always-on DLD rule for the named agents",
  usage: `Usage: dld install-rule --agent <names> [--force]

Install the always-on DLD rule for the named agents, and refresh any rule already installed.
Skills are not touched; use dld init or dld update for those.

Options:
  --agent <names>  Agents to install the rule for
  --force          Replace a rule installed by a newer dld-kit

${AGENT_HELP}
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: { agent: { type: "string", multiple: true }, force: { type: "boolean" } }
    });
    const requested = parseAgents(values.agent);
    const root = findProjectRoot(ctx);
    const rules = /* @__PURE__ */ new Set([...installedTargets(ctx, root).rules, ...targetsFor(requested).rules]);
    if (rules.size === 0) {
      throw new UsageError(`name the agents with --agent (${HARNESS_NAMES.join(", ")})`);
    }
    const plan = planInstall(ctx, root, {
      layouts: /* @__PURE__ */ new Set(),
      rules,
      version,
      force: values.force === true,
      harnesses: requested
    });
    const report2 = applyInstall(ctx, root, plan);
    printReport(io, report2);
    if (report2.ruleWritten.length === 0 && report2.ruleRemoved.length === 0) {
      io.stdout("The DLD rule is up to date.\n");
    }
    return EXIT_OK;
  }
};

// src/cli/commands/list-taken-ids.ts
var listTakenIdsCommand = {
  name: "list-taken-ids",
  summary: "List decision IDs taken on the base branch and in open PRs",
  internal: true,
  usage: `Usage: dld list-taken-ids [--base <ref>]

Print the decision IDs on the base branch and in records touched by open pull requests
(via gh, when available), one per line, sorted.

Options:
  --base <ref>  Base ref (default: origin/main)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    const base = baseOption(values.base);
    const { ids, skipped } = listTakenIds(ctx, loadProject(ctx), base);
    for (const id of ids) io.stdout(`${id}
`);
    if (skipped !== void 0) io.stderr(skippedNotice(skipped));
    return EXIT_OK;
  }
};

// src/cli/commands/next-id.ts
var nextIdCommand = {
  name: "next-id",
  summary: "Print the next sequential decision ID",
  internal: true,
  usage: "Usage: dld next-id\n\nPrint the next decision ID, e.g. DL-004.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    const { paths } = loadProject(ctx);
    io.stdout(`${nextId(ctx, paths.recordsDir)}
`);
    return EXIT_OK;
  }
};

// src/cli/commands/plan-renames.ts
var planRenamesCommand = {
  name: "plan-renames",
  summary: "Plan renames that resolve decision ID collisions",
  internal: true,
  usage: `Usage: dld plan-renames [--base <ref>]

Print <path>\\t<DL-OLD>\\t<DL-NEW> for each colliding local decision, assigning the next free
IDs. Prints nothing when there are no collisions.

Options:
  --base <ref>  Base ref (default: origin/main)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({ args: [...args], options: { base: { type: "string" } } });
    const base = baseOption(values.base);
    const { renames, skipped } = planRenames(ctx, loadProject(ctx), base);
    for (const rename of renames) io.stdout(`${formatRename(rename)}
`);
    if (skipped !== void 0) io.stderr(skippedNotice(skipped));
    return EXIT_OK;
  }
};

// src/cli/commands/regenerate-index.ts
var regenerateIndexCommand = {
  name: "regenerate-index",
  summary: "Rebuild INDEX.md from the decision records",
  internal: true,
  usage: `Usage: dld regenerate-index [--include-base <ref>]

Rebuild INDEX.md from every decision record.

Options:
  --include-base <ref>  Also list records that exist only on this git ref
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: { "include-base": { type: "string" } }
    });
    const { config, paths } = loadProject(ctx);
    if (!ctx.fs.isDirectory(paths.recordsDir)) {
      throw new DldError(`records directory not found at ${paths.recordsDir}`);
    }
    const rows = collectIndexRows(ctx, paths, values["include-base"]);
    writeIndex(ctx, paths, renderIndex(rows, config.mode));
    io.stdout(rows.length === 0 ? "INDEX.md regenerated (empty).\n" : "INDEX.md regenerated.\n");
    return EXIT_OK;
  }
};

// src/cli/commands/rename-decision.ts
var renameDecisionCommand = {
  name: "rename-decision",
  summary: "Rename a local decision and rewrite its references",
  internal: true,
  usage: `Usage: dld rename-decision --old <DL-OLD> --new <DL-NEW> --path <path> [--base <ref>]

Rename a locally added decision with git mv, rewrite its id and references in changed
decision files, and rewrite annotations in changed files. Prints <path> -> <new path>.

Options:
  --old <DL-OLD>  Current ID (required)
  --new <DL-NEW>  New ID (required)
  --path <path>   Record path relative to the project root (required)
  --base <ref>    Base ref for the local change set (default: origin/main)
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: {
        old: { type: "string" },
        new: { type: "string" },
        path: { type: "string" },
        base: { type: "string" }
      }
    });
    const { old: oldId, new: newId, path } = values;
    if (!oldId || !newId || !path) throw new DldError("--old, --new, and --path are required.");
    const base = baseOption(values.base);
    const newPath = renameDecision(ctx, loadProject(ctx), { path, oldId, newId }, base);
    io.stdout(`${path} -> ${newPath}
`);
    return EXIT_OK;
  }
};

// src/cli/commands/resolve-base.ts
var resolveBaseCommand = {
  name: "resolve-base",
  summary: "Print the base ref to check decision IDs against",
  internal: true,
  usage: `Usage: dld resolve-base

Print the current branch's upstream when it tracks a differently named branch, otherwise
origin/main.
`,
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    io.stdout(`${resolveBase(ctx)}
`);
    return EXIT_OK;
  }
};

// src/cli/commands/session-context.ts
var sessionContextCommand = {
  name: "session-context",
  summary: "Print the DLD rule for a session hook, unless the agent loads it already",
  usage: `Usage: dld session-context --agent <name>

Print the always-on DLD rule, for a harness hook that adds it to the session context.
Prints nothing outside a project with dld.config.yaml, or when the agent already loads
the rule there (its rule file, or the dld-kit block in the instruction file it reads).
Never fails the session: other errors print one line on stderr and exit 0.

Options:
  --agent <name>  The agent whose session this is

Agents: ${HARNESS_NAMES.join(", ")}.
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: { agent: { type: "string" } }
    });
    const [harness, ...others] = parseAgents(values.agent === void 0 ? [] : [values.agent]);
    if (harness === void 0 || others.length > 0) {
      throw new UsageError(`name one agent with --agent (${HARNESS_NAMES.join(", ")})`);
    }
    let root;
    try {
      root = findProjectRoot(ctx);
    } catch {
      return EXIT_OK;
    }
    try {
      const text = sessionContext(ctx, root, harness);
      if (text !== void 0) io.stdout(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      io.stderr(`dld session-context: ${message}
`);
    }
    return EXIT_OK;
  }
};

// src/cli/commands/update.ts
import { join as join18 } from "node:path";
var updateCommand = {
  name: "update",
  summary: "Refresh the installed DLD skills and rule to this version",
  usage: `Usage: dld update [--agent <names>] [--force]

Rewrite the DLD skills and always-on rule already installed in this project with this version
of dld-kit, and install them for any agents named with --agent. Decision records and
dld.config.yaml are never changed.

Options:
  --agent <names>  Also install for these agents
  --force          Replace files installed by a newer dld-kit

${AGENT_HELP}
`,
  run(args, io, ctx) {
    const { values } = parseCommandArgs({
      args: [...args],
      options: { agent: { type: "string", multiple: true }, force: { type: "boolean" } }
    });
    const requested = parseAgents(values.agent);
    const root = findProjectRoot(ctx);
    if (!ctx.fs.lexists(join18(root, CONFIG_FILE))) {
      throw new DldError(`DLD is not set up here (${CONFIG_FILE} not found). Run dld init first.`);
    }
    const installed = installedTargets(ctx, root);
    const added = targetsFor(requested);
    const layouts = /* @__PURE__ */ new Set([...installed.layouts, ...added.layouts]);
    const rules = /* @__PURE__ */ new Set([...installed.rules, ...added.rules]);
    if (layouts.size === 0 && rules.size === 0) {
      throw new UsageError(
        `no DLD skills or rule are installed yet; name the agents with --agent (${HARNESS_NAMES.join(", ")})`
      );
    }
    const plan = planInstall(ctx, root, {
      source: layouts.size > 0 ? packageSource(ctx, cliPath(io), "update") : void 0,
      layouts,
      rules,
      version,
      force: values.force === true,
      harnesses: requested
    });
    const report2 = applyInstall(ctx, root, plan);
    report2.warnings.push(...missingAgentsRuleWarning({ layouts, rules }));
    printReport(io, report2);
    return EXIT_OK;
  }
};

// src/cli/commands/update-audit-state.ts
var updateAuditStateCommand = {
  name: "update-audit-state",
  summary: "Record the audit run in .dld-state.yaml",
  internal: true,
  usage: "Usage: dld update-audit-state\n\nRecord the current time and HEAD commit as the last audit.\n",
  run(args, io, ctx) {
    parseCommandArgs({ args: [...args], options: {} });
    const { timestamp, commit } = updateAuditState(ctx, loadProject(ctx));
    io.stdout(`Audit state updated: ${timestamp} at ${commit}
`);
    return EXIT_OK;
  }
};

// src/cli/commands/update-snapshot-state.ts
var updateSnapshotStateCommand = {
  name: "update-snapshot-state",
  summary: "Record the snapshot run in .dld-state.yaml",
  internal: true,
  usage: `Usage: dld update-snapshot-state [artifact ...]

Record the snapshot time, HEAD commit and highest accepted decision, with timestamps for
SNAPSHOT.md, OVERVIEW.md and any custom artifacts named.
`,
  run(args, io, ctx) {
    const { positionals } = parseCommandArgs({
      args: [...args],
      options: {},
      allowPositionals: true
    });
    const { timestamp, commit, highest } = updateSnapshotState(ctx, loadProject(ctx), positionals);
    io.stdout(`Snapshot state updated: ${timestamp} at ${commit} (through ${formatId(highest)})
`);
    return EXIT_OK;
  }
};

// src/cli/commands/update-status.ts
var updateStatusCommand = {
  name: "update-status",
  summary: "Set a decision's status",
  internal: true,
  usage: `Usage: dld update-status <DL-NNN> <${STATUSES.join("|")}>

Change only the status line of a decision record.
`,
  run(args, io, ctx) {
    const { positionals } = parseCommandArgs({
      args: [...args],
      options: {},
      allowPositionals: true
    });
    const [id, status, ...extra] = positionals;
    if (id === void 0 || status === void 0)
      throw new UsageError("expected <DL-NNN> <status>");
    if (extra.length > 0) throw new UsageError(`unexpected argument '${extra[0]}'`);
    if (!isStatus(status)) {
      throw new DldError(
        `invalid status '${status}'. Must be: proposed, accepted, deprecated, superseded.`
      );
    }
    updateStatus(ctx, loadProject(ctx), id, status);
    io.stdout(`Updated ${id} status to ${status}.
`);
    return EXIT_OK;
  }
};

// src/cli/commands/verify-annotations.ts
var EXIT_MISSING = 1;
var verifyAnnotationsCommand = {
  name: "verify-annotations",
  summary: "Check that decisions have annotations in the code",
  internal: true,
  usage: "Usage: dld verify-annotations <DL-NNN> [DL-NNN ...]\n\nExit 0 if every decision has at least one annotation, 1 if any are missing.\n",
  run(args, io, ctx) {
    const { positionals: ids } = parseCommandArgs({
      args: [...args],
      options: {},
      allowPositionals: true
    });
    if (ids.length === 0) throw new UsageError("expected at least one decision ID");
    const options = scanOptionsFor(loadProject(ctx));
    const prefix = options.prefix;
    const missing = missingAnnotations(ctx, options, ids);
    if (missing.length > 0) {
      io.stdout(`MISSING annotations in source code for: ${missing.join(" ")}
`);
      io.stdout(
        `Every implemented decision must have at least one ${prefix}(DL-NNN) annotation in the codebase.
`
      );
      return EXIT_MISSING;
    }
    io.stdout("All decisions have code annotations.\n");
    return EXIT_OK;
  }
};

// src/cli/index.ts
var COMMANDS = [
  initCommand,
  updateCommand,
  installRuleCommand,
  sessionContextCommand,
  createConfigCommand,
  createDirectoriesCommand,
  createEmptyIndexCommand,
  nextIdCommand,
  createDecisionCommand,
  updateStatusCommand,
  regenerateIndexCommand,
  verifyAnnotationsCommand,
  findAnnotationsCommand,
  findMissingAmendsCommand,
  updateAuditStateCommand,
  collectActiveDecisionsCommand,
  detectSnapshotChangesCommand,
  updateSnapshotStateCommand,
  resolveBaseCommand,
  listTakenIdsCommand,
  findCollisionsCommand,
  planRenamesCommand,
  renameDecisionCommand,
  findStaleMentionsCommand,
  commitReindexCommand
];
var INTERNAL_HEADING = "Commands the skills run (internal; may change in minor releases)";
var INTERNAL_NOTE = "Internal: the dld-kit skills run this command. Its name, arguments and output may change in a minor release.\n";
function usage(commands) {
  const list = (group) => group.map((c) => `  ${c.name.padEnd(25)} ${c.summary}`).join("\n");
  const setup = commands.filter((c) => !c.internal);
  const internal = commands.filter((c) => c.internal);
  const sections = [`Setup commands:
${list(setup)}`];
  if (internal.length > 0) sections.push(`${INTERNAL_HEADING}:
${list(internal)}`);
  return `Usage: dld <command> [options]

${sections.join("\n\n")}

Options:
  -h, --help     Show this help, or a command's help after its name
  -v, --version  Show the dld version
`;
}
function run(argv, io, ctx, commands = COMMANDS) {
  const [first, ...rest] = argv;
  if (first === void 0) {
    io.stderr(usage(commands));
    return EXIT_USAGE;
  }
  if (first === "-h" || first === "--help") {
    io.stdout(usage(commands));
    return EXIT_OK;
  }
  if (first === "-v" || first === "--version") {
    io.stdout(`${version}
`);
    return EXIT_OK;
  }
  const command = commands.find((c) => c.name === first);
  if (command === void 0) {
    io.stderr(`dld: unknown command or option '${first}'

${usage(commands)}`);
    return EXIT_USAGE;
  }
  try {
    const result = command.run(rest, io, ctx);
    if (typeof result === "number") return result;
    return result.catch((error) => report(error, command, io));
  } catch (error) {
    return report(error, command, io);
  }
}
function report(error, command, io) {
  if (error instanceof HelpRequested) {
    io.stdout(command.internal ? `${command.usage}
${INTERNAL_NOTE}` : command.usage);
    return EXIT_OK;
  }
  if (error instanceof UsageError) {
    io.stderr(`dld ${command.name}: ${error.message}

${command.usage}`);
    return error.exitCode;
  }
  if (error instanceof DldError) {
    io.stderr(`Error: ${error.message}
`);
    return error.exitCode;
  }
  io.stderr(`dld: unexpected error (this is a bug)
${describe2(error)}
`);
  return 1;
}
function describe2(error) {
  return error instanceof Error ? error.stack ?? String(error) : String(error);
}

// src/node-context.ts
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
var nodeFileSystem = {
  exists: (path) => existsSync(path),
  isDirectory: (path) => fsCall("read", path, () => statSync(path, { throwIfNoEntry: false })?.isDirectory() ?? false),
  lexists: (path) => fsCall("read", path, () => lstatSync(path, { throwIfNoEntry: false }) !== void 0),
  isRegularFile: (path) => fsCall("read", path, () => lstatSync(path, { throwIfNoEntry: false })?.isFile() ?? false),
  readFile: (path) => fsCall("read", path, () => readFileSync(path, "utf8")),
  readBytes: (path) => fsCall("read", path, () => readFileSync(path)),
  readDir: (path) => fsCall(
    "read",
    path,
    () => readdirSync(path, { withFileTypes: true }).map((entry) => ({
      name: entry.name,
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory()
    }))
  ),
  writeFile: (path, content) => fsCall("write", path, () => writeFileSync(path, content)),
  fileMode: (path) => fsCall("read", path, () => lstatSync(path).mode & 4095),
  chmod: (path, mode) => fsCall("change mode of", path, () => chmodSync(path, mode)),
  mkdir: (path) => fsCall("create directory", path, () => void mkdirSync(path, { recursive: true })),
  rename: (from, to) => fsCall("rename", from, () => renameSync(from, to)),
  link: (existing, newPath) => fsCall("create", newPath, () => linkSync(existing, newPath)),
  remove: (path) => fsCall("remove", path, () => rmSync(path, { force: true })),
  removeDir: (path) => fsCall("remove directory", path, () => rmdirSync(path)),
  realPath: (path) => fsCall("resolve", path, () => realpathSync(path))
};
function fsCall(operation, path, run2) {
  try {
    return run2();
  } catch (error) {
    if (error instanceof Error && "code" in error && typeof error.code === "string") {
      throw new FsError(operation, path, error.code);
    }
    throw error;
  }
}
var GIT_MAX_BUFFER = 1024 * 1024 * 1024;
function nodeGit(cwd, env) {
  return (args) => {
    try {
      return execFileSync("git", args, {
        cwd,
        env,
        encoding: "utf8",
        maxBuffer: GIT_MAX_BUFFER,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      if (hasCode(error, "ENOENT")) throw new DldError("git is not installed or not on PATH");
      if (hasCode(error, "ENOBUFS")) {
        throw new DldError(`git ${args.join(" ")} produced more output than dld can buffer`);
      }
      if (hasStatus(error)) {
        throw new GitCommandError(args, String(error.stderr ?? "").trim(), error.status);
      }
      throw error;
    }
  };
}
var GH_TIMEOUT_MS = 6e4;
function nodeGh(cwd, env, timeoutMs = GH_TIMEOUT_MS) {
  return (args) => {
    try {
      return execFileSync("gh", args, {
        cwd,
        env: { ...env, GH_PROMPT_DISABLED: "1" },
        encoding: "utf8",
        maxBuffer: GIT_MAX_BUFFER,
        timeout: timeoutMs,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      if (hasCode(error, "ENOENT")) throw new ToolNotFoundError("gh");
      if (hasCode(error, "ETIMEDOUT")) {
        throw new GhCommandError(args, `timed out after ${timeoutMs / 1e3} seconds`);
      }
      if (hasStatus(error)) throw new GhCommandError(args, String(error.stderr ?? "").trim());
      throw error;
    }
  };
}
function createNodeContext(cwd, env) {
  return {
    cwd,
    fs: nodeFileSystem,
    git: nodeGit(cwd, env),
    gh: nodeGh(cwd, env),
    env,
    readStdin: () => fsCall("read", "standard input", () => readFileSync(0, "utf8")),
    now: () => /* @__PURE__ */ new Date()
  };
}
function hasCode(error, code) {
  return error instanceof Error && "code" in error && error.code === code;
}
function hasStatus(error) {
  return error instanceof Error && "status" in error && typeof error.status === "number";
}

// src/bin.ts
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error) => {
    if (error.code === "EPIPE") process.exit();
    throw error;
  });
}
async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return await new Promise((resolve, reject) => {
      const cancel = () => reject(new DldError("cancelled", 130));
      rl.once("SIGINT", cancel);
      rl.once("close", cancel);
      rl.question(question).then(resolve, reject);
    });
  } finally {
    rl.close();
  }
}
var interactive = process.stdin.isTTY === true && process.stdout.isTTY === true;
process.exitCode = await run(
  process.argv.slice(2),
  {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
    // @decision(DL-042)
    cliPath: fileURLToPath(import.meta.url),
    ...interactive ? { prompt: ask } : {}
  },
  createNodeContext(process.cwd(), process.env)
);
