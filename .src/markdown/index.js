`use strict`;

export { format } from "./formatter.js";

/**
 * @typedef {Object} Heading
 * @property {number} level
 * @property {string} id
 * @property {string} hashed
 * @property {number} count
 * @property {string} text
 */

/**
 * @param {number} indent
 * @returns {string}
 */
export function spaces(indent) {
  return ` `.repeat(indent)
}

/**
 * to map
 * @param {Object} obj
 * @returns {Map<string, string>}
 */
export function map(obj) {
  return new Map(Object.entries(obj))
}

/**
 * @param {string} str
 * @returns {string}
 */
export function hsc(str) {
  return str
    .replace(/&/g, `&amp;`)
    .replace(/</g, `&lt;`)
    .replace(/>/g, `&gt;`)
    .replace(/"/g, `&quot;`)
    .replace(/'/g, `&apos;`)
    .replace(/^--- $/g, `&mdash; `) // for <blockquote>
}

/**
 * unescape markdown syntax
 * @param {string} str
 * @returns {string}
 */
function unescape(str) {
  return str.replace(/\\([\*|\`|\!|\[|\]|\<|\>|\(|\)|])/g, `$1`)
}

/**
 * @param {Node} node
 * @returns {string}
 */
export function serialize_child_text(node) {
  if (node.name === `text`) return node.text
  return node.children.map((child) => serialize_child_text(child)).join(``)
}

/**
 * @param {Node} h
 * @returns {string}
 */
export function create_id_from_text(h) {
  const id = serialize_child_text(h)
    .replace(/[!"#$%&'()*+,/:;<=>?\[\\\]^{|}~]/g, ``) // 記号は .-_ のみ
    .replace(/[、。「」]/g, ``) // 全角記号も消す
    .replace(/ /g, `-`)
    .toLocaleLowerCase()
  return id
}

/**
 * Headings の配列を <ul>/<ol> リストに組み直す
 * @param {Array.<Node>} headings
 * @param {{list:string}} opt
 */
export function to_toc(headings, opt = { list: `ol` }) {
  const name = opt.list
  const root = node({ name, type: `block`, level: 1 });

  /**
   * @param {Array.<Node>} param0
   * @param {Node} current
   * @returns {Node}
   */
  function list([head, ...tail], current) {
    if (head === undefined) return root;
    const li = node({ name: `li`, type: `inline` })
    li.appendChildren(head.children)

    if (current.level === head.level) {
      current.appendChild(li);
      return list(tail, current);
    }

    // 一段ネスト
    if (current.level + 1 === head.level) {
      const ul = node({ name, type: `block`, level: head.level });
      current.appendChild(ul);
      ul.appendChild(li);
      return list(tail, ul);
    }

    // 上に戻る
    if (current.level > head.level) {
      return list([head, ...tail], current.parent);
    }
  }
  return list(headings, root)
}

/**
 * HTML Attribute にエンコードされる値
 * 内部の値を保つために `_` で始まる値は
 * エンコード時に無視する (TODO: これ消したい)
 * @typedef {Map.<string, string | null>} Attr
 */

/**
 * @param {Attr} attr
 * @returns {string}
 */
function attr_str(attr = new Map()) {
  const quote = [`title`, `alt`, `cite`, `href`, `id`]
  return Array.from(attr).map(([k, v]) => {
    // 内部で使う値なので無視
    if (k.startsWith(`_`)) return ``

    // 値のみ
    if (v === null) return ` ${k}`

    // align 属性は非推奨
    if (k === `align`) return ` class=align-${v}`

    // これらは中身がなんであれ Quote
    if (quote.includes(k)) return ` ${k}="${v}"`

    // スペース " ' ` = <  > が無ければ quote は不要
    // https://html.spec.whatwg.org/multipage/introduction.html#a-quick-introduction-to-html
    if (v.match(/[ "'`=<>]/) === null) return ` ${k}=${v}`

    return ` ${k}="${v}"`
  }).join(``)
}

/**
 * @typedef {Object} NodeParam
 * @prop {string} name
 * @prop {string} type
 * @prop {Node} [parent]
 * @prop {Array.<Node>} [children]
 * @prop {number} [level]
 * @prop {string} [text]
 * @prop {Attr} [attr]
 * @prop {Array.<"center" | "left" | "right">} [aligns]
 */

/**
 * @param {NodeParam} param
 * @returns {Node}
 */
export function node({ name, type, parent, children, level, text, attr, aligns }) {
  return new Node({
    name,
    type,
    parent,
    children,
    level,
    text,
    attr,
    aligns,
  })
}

export class Node {
  /**
   * @param {NodeParam} param
   */
  constructor({ name, type, parent = null, children = [], level = undefined, text = undefined, attr = new Map(), aligns = [] }) {
    this.name = name
    this.type = type
    this.parent = parent
    this.level = level
    this.text = text
    this.attr = attr
    this.aligns = aligns

    /**@type{Array.<Node>}*/
    this.children = []
    this.appendChildren(children)
  }

  /**
   * @param {Node} child
   */
  appendChild(child) {
    child.parent = this
    this.children.push(child)
  }

  /**
   * @param {Array.<Node>} children
   */
  appendChildren(children) {
    children.forEach((child) => this.appendChild(child))
  }

  /**
   * @returns {Node}
   */
  lastChild() {
    return this.children[this.children.length - 1]
  }

  /**
   * @param {string} text
   */
  addText(text) {
    const child = node({ name: `text`, type: `inline`, text: unescape(text) })
    this.appendChild(child)
  }
}

/**
 * @typedef {Object} EncodeOption
 * @prop {number} [indent]
 */

/**
 * Convert Markdown AST to HTML
 * @param {Node} node
 * @param {EncodeOption} [option]
 * @returns {string}
 */
export function encode(node, option = {}) {

  /**
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function text(node, indent) {
    return `${spaces(indent)}${hsc(node.text)}`
  }

  /**
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function raw(node, indent) {
    return `${spaces(indent)}${node.text}`
  }

  /**
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function heading(node, indent) {
    const name = `h${node.level}`
    const text = node.children.map((child) => serialize(child)).join(``)
    const attr = node.attr

    if (node.level === 1) {
      return `${spaces(indent)}<h1${attr_str(attr)}>${text}</h1>\n`
    } else {
      return `${spaces(indent)}<${name}${attr_str(attr)}>${text}</${name}>\n`
    }
  }

  /**
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function a(node, indent) {
    const attr = node.attr
    // url 内の () を escape してるので戻す
    const href = unescape(attr.get(`href`))
    attr.set(`href`, href)
    return `<a${attr_str(attr)}>${node.children.map((child) => serialize(child)).join(``)}</a>`
  }

  /**
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function pre(node, indent) {
    const attr = node.attr

    const lang = attr.get(`lang`)
    if (lang) {
      attr.set(`class`, lang)
      attr.set(`data-code`, lang)
      attr.delete(`lang`)
    }
    if (attr.has(`path`)) {
      attr.set(`data-path`, attr.get(`path`))
      attr.delete(`path`)
    }
    const code = node.children.map((child) => serialize(child)).join(`\n`)
    const lang_class = lang ? ` class=language-${lang}` : ``
    return [
      `${spaces(indent)}<pre${attr_str(attr)}><code translate=no${lang_class}>`,
      code,
      `</code></pre>\n`
    ].join(``)
  }

  /**
   * td & th
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function td(node, indent) {
    const name = node.name
    const attr = attr_str(node.attr)
    return [
      `${spaces(indent)}<${name}${attr}>`,
      node.children.map((child) => serialize(child)).join(``),
      `</${name}>\n`,
    ].join(``)
  }

  /**
   * figcaption
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function figcaption(node, indent) {
    const attr = attr_str(node.attr)
    return [
      `${spaces(indent)}<figcaption${attr}>`,
      node.text,
      `</figcaption>\n`,
    ].join(``)
  }

  /**
   * dt & dd
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function dt(node, indent) {
    const name = node.name
    const attr = attr_str(node.attr)
    if (node.type === `inline`) {
      return [
        `${spaces(indent)}<${name}${attr}>`,
        node.children.map((child) => serialize(child)).join(``),
        `\n`
      ].join(``)
    } else {
      return [
        `${spaces(indent)}<${name}${attr}>\n`,
        node.children.map((child) => serialize(child, indent + 2)).join(``),
        `${spaces(indent)}</${name}>\n`,
      ].join(``)
    }
  }

  /**
   * summary
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function summary(node, indent) {
    const attr = attr_str(node.attr)
    return [
      `${spaces(indent)}<summary${attr}>`,
      node.children.map((child) => serialize(child)).join(``),
      `</summary>\n`
    ].join(``)
  }

  /**
   * details
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function details(node, indent) {
    node.attr.delete(`class`) // TODO: details 以外は大丈夫?
    const attr = attr_str(node.attr)
    return [
      `${spaces(indent)}<details${attr}>\n`,
      node.children.map((child) => serialize(child, indent + 2)).join(``),
      `${spaces(indent)}</details>\n`,
    ].join(``)
  }

  /**
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function mix_inline(node, indent) {
    // grouping lines into array
    // [inline, inline, block, block, inline]
    // to
    // [[inline, inline], block, block, [inline]]
    const lines = node.children.reduce((lines, child) => {
      if (child.type === `block`) {
        lines.push(child)
        return lines
      }
      if (child.type === `inline`) {
        const last = lines.pop()
        if (Array.isArray(last)) {
          last.push(child)
          lines.push(last)
          return lines
        }
        else if (last === undefined) {
          lines.push([child])
          return lines
        }
        else {
          lines.push(last)
          lines.push([child])
          return lines
        }
      }
    }, [])

    if (lines.length === 1 && Array.isArray(lines[0])) {
      // children に inline のみしかないので一列で閉じなし
      const name = node.name
      const attr = attr_str(node.attr)
      return `${spaces(indent)}<${name}${attr}>${lines[0].map((child) => serialize(child)).join(``)}\n`
    }

    // block と inline が同居している場合
    const child = lines.map((line) => {
      if (Array.isArray(line)) {
        // inline はまとめて一行
        return `${spaces(indent + 2)}${line.map((child) => serialize(child)).join(``)}\n`
      } else {
        // block はインデント
        return serialize(line, indent + 2)
      }
    }).join(``)

    // その結果を改行した <open></close> で閉じる
    return [
      `${spaces(indent)}<${node.name}${attr_str(node.attr)}>\n`,
      `${child}`,
      `${spaces(indent)}</${node.name}>\n`
    ].join(``)
  }

  /**
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function root(node, indent) {
    return node.children.map((child) => serialize(child, indent)).join(``)
  }

  /**
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function section(node, indent) {
    const name = node.level === 1 ? `article` : `section`
    const attr = attr_str(node.attr)
    return [
      `${spaces(indent)}<${name}${attr}>\n`,
      node.children.map((child) => serialize(child, indent + 2)).join(``),
      `${spaces(indent)}</${name}>\n`,
    ].join(``)
  }

  /**
   * @param {Node} node
   * @param {number} indent
   * @returns {string}
   */
  function serialize(node, indent = 0) {
    const name = node.name
    if (name === `text`) /*          */ return text(node, indent)
    if (name === `raw`) /*           */ return raw(node, indent)
    if (name === `heading`) /*      */ return heading(node, indent)
    if (name === `section`) /*       */ return section(node, indent)
    if (name === `a`) /*             */ return a(node, indent)
    if (name === `pre`) /*           */ return pre(node, indent)
    if (name === `root`) /*          */ return root(node, indent)
    if (name === `figcaption`) /*    */ return figcaption(node, indent)
    if (name === `th` || name === `td`) return td(node, indent)
    if (name === `dt` || name === `dd`) return dt(node, indent)
    if (name === `p`) /*             */ return mix_inline(node, indent)
    if (name === `li`) /*            */ return mix_inline(node, indent)
    if (name === `summary`) /*       */ return summary(node, indent)
    if (name === `details`) /*       */ return details(node, indent)

    // Print HTML as-is
    if (name === `html`) {
      return node.children.map(({ text }) => `${spaces(indent)}${text}\n`).join(``)
    }

    // 要素をまとめるためだけの疑似要素
    if (name === `empty`) {
      // inline なら indent しない
      const i = node.type === `inline` ? 0 : indent
      return node.children.map((child) => serialize(child, i)).join(``)
    }

    if (node.children.length === 0) {
      // 子要素が無いやつ (link, source, img)
      const name = node.name
      const attr = attr_str(node.attr)
      return `${spaces(indent)}<${name}${attr}>\n`
    }

    // Other Inline
    if (node.type === `inline`) {
      const attr = attr_str(node.attr)
      return `<${name}${attr}>${node.children.map((child) => serialize(child)).join(``)}</${name}>`
    }

    // Other Blocks
    if (node.type === `block`) {
      const attr = attr_str(node.attr)
      return [
        `${spaces(indent)}<${name}${attr}>\n`,
        node.children.map((child) => serialize(child, indent + 2)).join(``),
        `${spaces(indent)}</${name}>\n`,
      ].join(``)
    }

    throw new Error(`can't be here`)
  }

  const html = serialize(node, option.indent)
  return html
}

/**
 * Parse Markdown text to AST
 * @param {string} md
 * @returns {Node}
 */
export function decode(md) {

  /**
   * @param {RegExpExecArray} result
   * @param {Array.<string>} rest
   * @param {Node} ast
   * @returns {Node}
   */
  function heading(result, rest, ast) {
    const { symbol, spaces, text } = result.groups

    if (spaces.length > 1) throw new Error(`too many spaces in "${result.input}"`)
    if (text.startsWith(` `) || text.endsWith(` `)) throw new Error(`too many spaces in "${result.input}"`)

    const level = symbol.length

    const section = node({
      name: `section`,
      type: `block`,
      level,
    })

    // タグの [] のせいで複数の text node に別れている場合がある
    // あとで使いにくいのでマージする
    const children = inline(text).reduce((acc, curr) => {
      if (curr.name === `text` && acc[acc.length - 1]?.name === `text`) {
        acc[acc.length - 1].text += curr.text
      } else {
        acc.push(curr)
      }
      return acc
    }, [])

    const h = node({
      name: `heading`,
      type: `inline`,
      level,
      children,
    })

    section.appendChild(h)

    if (ast.level < level) {
      // increment only +1
      if (ast.level !== level - 1) throw new Error(`invalid sectioning "${result.input}"`)
      // adding as child of <section>
      ast.appendChild(section)
      return parse(rest, section)
    }

    if (ast.level === level) {
      // adding as sibling of section
      // rise to parent section
      ast.parent.appendChild(section)
      return parse(rest, section)
    }

    // adding section to parent
    while (ast.level > level - 1) {
      ast = ast.parent
    }
    ast.appendChild(section)
    return parse(rest, section)
  }

  /**
   * @param {RegExpExecArray} result
   * @param {Array.<string>} rest
   * @param {Node} ast
   * @returns {Node}
   */
  function dl(result, rest, ast) {
    const { spaces, text } = result.groups

    if (spaces.length > 1) throw new Error(`too many spaces in "${result.input}"`)
    if (text.endsWith(` `)) throw new Error(`too many spaces around "${result.input}"`)

    const prev = ast.lastChild()

    if (prev?.name === `p`) {
      // まだ <dl> が始まっておらず、直前の <p> を <dt> にする

      const p = ast.children.pop() // p を ast から外す

      const div = node({
        name: `div`,
        type: `block`,
      })

      const dt = node({
        name: `dt`,
        type: `inline`,
        children: p.children
      })
      p.children = []

      const dd = node({
        name: `dd`,
        type: `inline`,
        children: inline(text),
      })

      div.appendChild(dt)
      div.appendChild(dd)

      // もし既に直前に閉じた <dl> があったらそっちに足す
      const parent = ast.lastChild()

      if (parent?.name === `dl`) {
        parent.appendChild(div)
        return parse(rest, ast)
      } else {
        const dl = node({
          name: `dl`,
          type: `block`,
        })
        dl.appendChild(div)
        ast.appendChild(dl)
        return parse(rest, ast)
      }
    }

    if (prev?.name === `dl`) {
      // すでに <dl> が始まっており <dd> が複数あるパターン
      const div = prev.lastChild()
      const dd = node({
        name: `dd`,
        type: `inline`,
        children: inline(text),
      })
      div.appendChild(dd)
      return parse(rest, ast)
    }

    throw new Error(`invalid <dd> in "${result.input}"`)
  }

  /**
   * @param {RegExpExecArray} result
   * @param {Array.<string>} rest
   * @param {Node} ast
   * @returns {Node}
   */
  function table_caption(result, rest, ast) {
    const caption = result.groups.caption

    // table
    const thead = node({
      name: `thead`,
      type: `block`,
      level: 0,
    })

    const table = node({
      name: `table`,
      type: `block`,
      level: 0,
      children: [thead]
    })

    // figure
    const figcaption = node({
      name: `figcaption`,
      type: `inline`,
      text: caption,
      level: 0
    })

    const figure = node({
      name: `figure`,
      type: `block`,
      level: 0,
      children: [figcaption, table]
    })

    ast.appendChild(figure)
    return parse(rest, thead)
  }

  /**
   * @param {RegExpExecArray} result
   * @param {Array.<string>} rest
   * @param {Node} ast
   * @returns {Node}
   */
  function table(result, rest, ast) {
    if (ast.parent?.name !== `table`) throw new Error(`Table caption required before "${result.input}"`)

    const row = result.groups.row
    const columns = row.split(`|`)

    if (row.startsWith(`:`) || row.startsWith(`-`)) {
      const aligns = columns.map((column) => {
        const start = Number(column.startsWith(`:`))
        const end = Number(column.endsWith(`:`))
        if (!(start ^ end)) return `center`
        if (start) return `left`
        if (end) return `right`
      })

      const thead = ast
      const table = ast.parent

      // 既にある thead > tr > th に align を付与
      const tr = thead.children.at(0)
      tr.children.forEach((th, i) => {
        th.attr.set(`align`, aligns.at(i))
      })

      const tbody = node({
        name: `tbody`,
        type: `block`,
        aligns: aligns
      })

      table.appendChild(tbody)
      return parse(rest, tbody)
    }

    if (ast.name === `thead`) {
      const thead = ast
      const th = columns.map((column) => {
        return node({
          name: `th`,
          type: `inline`,
          children: inline(column.trim()),
        })
      })

      const tr = node({
        name: `tr`,
        type: `block`,
        level: 0,
        children: th,
      })

      thead.appendChild(tr)
      return parse(rest, thead)
    }

    if (ast.name === `tbody`) {
      const tbody = ast
      const aligns = tbody.aligns

      const tr = node({
        name: `tr`,
        type: `block`,
        level: 0,
      })

      columns.forEach((column, i) => {
        const align = aligns.at(i)
        const td = node({
          name: `td`,
          type: `inline`,
          attr: map({ align }),
          children: inline(column.trim()),
        })
        tr.appendChild(td)
      })

      tbody.appendChild(tr)
      return parse(rest, tbody)
    }
  }

  /**
   * @param {RegExpExecArray} result
   * @param {Array.<string>} rest
   * @param {Node} ast
   * @returns {Node}
   */
  function pre(result, rest, ast) {
    const { lang, path } = result.groups
    const attr = new Map()

    if (lang) {
      if (lang.startsWith(` `) || lang.endsWith(` `)) throw new Error(`too many spaces around "${result.input}"`)
      attr.set(`lang`, lang)
    }

    if (path) {
      if (path.startsWith(` `) || path.endsWith(` `)) throw new Error(`too many spaces around "${result.input}"`)
      attr.set(`path`, path)
    }

    // already in <pre>
    if (ast.name === `pre`) return parse(rest, ast.parent)

    const pre = node({
      name: `pre`,
      type: `block`,
      attr
    })

    ast.appendChild(pre)
    return parse(rest, pre)
  }

  /**
   * @param {RegExpExecArray} result
   * @param {Array.<string>} rest
   * @param {Node} ast
   * @returns {Node}
   */
  function html(result, rest, ast) {
    if (ast.name !== `html`) {
      const html = node({
        name: `html`,
        type: `block`,
      })
      html.addText(result.input)
      ast.appendChild(html)
      return parse(rest, html)
    } else {
      ast.addText(result.input)
      return parse(rest, ast)
    }
  }

  /**
   * @param {string} name
   * @param {RegExpExecArray} result
   * @param {Array.<string>} rest
   * @param {Node} ast
   * @returns {Node}
   */
  function list(name, result, rest, ast) {
    const { indent, spaces, text } = result.groups

    if (spaces.length > 1) throw new Error(`too many spaces in "${result.input}"`)
    if (text.endsWith(` `)) throw new Error(`too many spaces in "${result.input}"`)

    const INDENT = 2

    if (indent.length % INDENT !== 0) throw new Error(`odd indent in list "${result.input}"`)

    const level = indent.length / INDENT

    const li = node({
      name: `li`,
      type: `inline`,
      level,
      children: inline(text),
    })

    // 親が <ul> / <ol> な場合、混ざっててもレベルで判断。
    if ([`ul`, `ol`].includes(ast.name)) {
      if (ast.level === level) {
        // in <ul>/<ol> and same level <li>
        ast.appendChild(li)
        return parse(rest, ast)
      }
      if (ast.level === level - 1) {
        // in <ul>/<ol> but lower level <li>
        const parent = ast.lastChild()
        const list = node({
          name,
          type: `block`,
          level,
        })
        list.appendChild(li)
        parent.appendChild(list)
        return parse(rest, list)
      }
      if (ast.level > level) {
        // in <ul>/<ol> but upper level <li>
        while (true) {
          if (ast.name === name && ast.level === level) break
          ast = ast.parent
        }
        ast.appendChild(li)
        return parse(rest, ast)
      }
    } else {
      // 親が <ul> / <ol> じゃないのでここからはじまる
      const list = node({
        name,
        type: `block`,
        level,
      })
      list.appendChild(li)
      ast.appendChild(list)
      return parse(rest, list)
    }
  }

  /**
   * @param {RegExpExecArray} result
   * @param {Array.<string>} rest
   * @param {Node} ast
   * @returns {Node}
   */
  function blockquote(result, rest, ast) {
    const { spaces, text } = result.groups

    if (spaces.length > 1) throw new Error(`too many spaces in "${result.input}"`)
    if (text.endsWith(` `)) throw new Error(`too many spaces around "${result.input}"`)

    const blockquote = (() => {
      if (ast.name === `blockquote`) return ast
      const blockquote = node({
        name: `blockquote`,
        type: `block`,
      })
      ast.appendChild(blockquote)
      return blockquote
    })()

    const p = node({
      name: `p`,
      type: `inline`,
    })
    blockquote.appendChild(p)

    if (text.startsWith(`--- `)) {
      const link = inline(text.slice(4))

      // url to <blockquote cite=${url}>
      const url = link[0].attr.get(`href`)
      blockquote.attr = map({ cite: url })

      // also adding <cite>${url}</cite>
      const cite = node({
        name: `cite`,
        type: `inline`,
        children: link
      })
      p.addText(`--- `)
      p.appendChild(cite)
    } else {
      p.appendChildren(inline(text))
    }
    return parse(rest, blockquote)
  }

  /**
   * `:::details`, `:::message`, `:::message alert` に対応
   * ただし rise() する先がわからなくなるので node は全て `details`
   *
   * @param {RegExpExecArray} result
   * @param {Array.<string>} rest
   * @param {Node} ast
   * @returns {Node}
   */
  function details(result, rest, ast) {
    const groups = result.groups

    // end <details>
    if (groups.symbol === undefined && groups.spaces === undefined && groups.text === undefined) {
      const details = rise(ast, `details`) // 登る先を固定するため details に統一
      return parse(rest, details.parent)
    }

    const { symbol, text } = (({ symbol, spaces, text }) => {
      if (symbol === `details`) {
        if (spaces.length > 1) throw new Error(`too many spaces in "${result.input}"`)
        if (text.length < 1) throw new Error(`text required in details "${result.input}"`)
        if (text.endsWith(` `)) throw new Error(`too many spaces around "${result.input}"`)
        return { symbol, text }
      }

      if (symbol === `message` && text === `alert`) {
        if (spaces.length > 1) throw new Error(`too many spaces in "${result.input}"`)
        if (text.endsWith(` `)) throw new Error(`too many spaces around "${result.input}"`)
        symbol = text
        return { symbol, text }
      }

      if (symbol === `message`) {
        if (spaces && spaces.length > 1) throw new Error(`too many spaces in "${result.input}"`)
        text = symbol
        return { symbol, text }
      }

      throw new Error(`start of ::: should have "details" or "message" in "${result.input}"`)
    })(groups);

    /**
     * <details>
     *  <summary>text</summary>
     *  <div>
     *  </div>
     * </details>
     */
    const details = (() => {
      if (ast.name === `details`) return ast
      const details = node({
        name: `details`,
        type: `block`,
        attr: map({ class: symbol }), // message, alert はこの class で判別
      })
      ast.appendChild(details)
      return details
    })()

    const summary = node({
      name: `summary`,
      type: `inline`,
    })
    summary.addText(text)
    details.appendChild(summary)

    const section = node({
      name: `section`,
      type: `block`,
    })
    details.appendChild(section)

    return parse(rest, section)
  }

  /**
   * @param {string} head
   * @param {Array.<string>} rest
   * @param {Node} ast
   * @returns {Node}
   */
  function p(head, rest, ast) {
    ast.children.push(node({
      name: `p`,
      type: `inline`,
      children: inline(head),
    }))
    return parse(rest, ast)
  }

  /**
   * @param {string} input
   * @param {number} _i
   * @returns {Array.<Node>}
   */
  function inline(input, _i = 0) {
    const { children, i } = inline_parse(input, _i)
    if (input.length !== i) console.assert(input.length == i, `input.length = ${input.length} but i = ${i}`)
    return children
  }

  /**
   * @param {string} input
   * @param {number} i
   * @returns {{children: Array.<Node>, i: number}}
   */
  function inline_parse(input, i = 0) {
    let start = i
    let child
    const parent = node({ name: `parent`, type: `inline` })
    while (i < input.length) {
      if (input[i] === `\\`) {
        i += 2
        continue
      }
      if (input[i] === `*` && input[i + 1] === `*`) {
        if (input[i - 1] === ` ` && input[i - 2] === ` `) throw new Error(`too many spaces before "${input}"`)
        if (input[i + 2] === ` `) throw new Error(`too many spaces in "${input}"`)
        if (start < i) parent.addText(input.slice(start, i));
        ({ child, i } = strong(input, i + 2))
        if (input[i] === ` ` && input[i + 1] === ` `) throw new Error(`too many spaces after "${input}"`)
        start = i
        parent.appendChild(child)
      }
      else if (input[i] === `*`) {
        if (input[i - 1] === ` ` && input[i - 2] === ` `) throw new Error(`too many spaces before "${input}"`)
        if (input[i + 1] === ` `) throw new Error(`too many spaces in "${input}"`)
        if (start < i) parent.addText(input.slice(start, i));
        ({ child, i } = em(input, i + 1))
        if (input[i] === ` ` && input[i + 1] === ` `) throw new Error(`too many spaces after "${input}"`)
        start = i
        parent.appendChild(child)
      }
      else if (input[i] === "`") {
        if (input[i - 1] === ` ` && input[i - 2] === ` `) throw new Error(`too many spaces before "${input}"`)
        if (input[i + 1] === ` `) throw new Error(`too many spaces in "${input}"`)
        if (start < i) parent.addText(input.slice(start, i));
        ({ child, i } = code(input, i + 1))
        if (input[i] === ` ` && input[i + 1] === ` `) throw new Error(`too many spaces after "${input}"`)
        start = i
        parent.appendChild(child)
      }
      else if (input[i] === `[`) {
        if (input[i - 1] === ` ` && input[i - 2] === ` `) throw new Error(`too many spaces before "${input}"`)
        // link じゃないかもしれないので、ここでは空白判定はしない
        if (start < i) parent.addText(input.slice(start, i));
        ({ child, i } = link(input, i + 1))
        if (input[i] === ` ` && input[i + 1] === ` `) throw new Error(`too many spaces after "${input}"`)
        start = i
        parent.appendChild(child)
      }
      else if (input[i] === `<`) {
        if (input[i - 1] === ` ` && input[i - 2] === ` `) throw new Error(`too many spaces before "${input}"`)
        // これがただの < かもしれないので、ここでは空白判定はしない
        if (start < i) parent.addText(input.slice(start, i));
        ({ child, i } = short_link(input, i + 1))
        if (input[i] === ` ` && input[i + 1] === ` `) throw new Error(`too many spaces after "${input}"`)
        start = i
        parent.appendChild(child)
      }
      else if (input[i] === `>` && input[i + 1] === ` ` && (i === 0 || input[i - 1] === ` `)) {
        if (start < i) {
          // 文の途中にある > はタダのカッコ
          i++
        } else {
          if (input[i - 1] === ` `) throw new Error(`too many spaces in "${input}"`);
          ({ child, i } = inline_blockquote(input, i + 2))
          start = i
          parent.appendChild(child)
        }
      }
      else if (input[i] === `!` && input[i + 1] === `[`) {
        if (input[i - 1] === ` ` && input[i - 2] === ` `) throw new Error(`too many spaces before "${input}"`)
        if (input[i + 2] === ` `) throw new Error(`too many spaces in "${input}"`)
        if (start < i) parent.addText(input.slice(start, i));
        ({ child, i } = img(input, i + 2))
        if (input[i] === ` ` && input[i + 1] === ` `) throw new Error(`too many spaces after "${input}"`)
        start = i
        parent.appendChild(child)
      }
      else if (
        input[i] === `h` &&
        input[i + 1] === `t` &&
        input[i + 2] === `t` &&
        input[i + 3] === `p` &&
        input[i + 4] === `:` &&
        input[i + 5] === `/` &&
        input[i + 6] === `/` &&
        input[i + 7] !== ` ` &&
        input[i + 7] !== undefined
      ) {
        if (start < i) parent.addText(input.slice(start, i));
        ({ child, i } = smart_link(input, i))
        start = i
        parent.appendChild(child)
      }
      else if (
        input[i] === `h` &&
        input[i + 1] === `t` &&
        input[i + 2] === `t` &&
        input[i + 3] === `p` &&
        input[i + 4] === `s` &&
        input[i + 5] === `:` &&
        input[i + 6] === `/` &&
        input[i + 7] === `/` &&
        input[i + 8] !== ` ` &&
        input[i + 8] !== undefined
      ) {
        if (start < i) parent.addText(input.slice(start, i));
        ({ child, i } = smart_link(input, i))
        start = i
        parent.appendChild(child)
      }
      else {
        i++
      }
    }
    if (start < i) {
      if (input[i - 1] === ` `) throw new Error(`too many spaces around "${input}"`)
      parent.addText(input.slice(start, i))
    }
    return { children: parent.children, i }
  }

  /**
   * @param {string} input
   * @param {number} i
   * @returns {{child: Node, i: number}}
   */
  function img(input, i) {
    // parse alt
    const alt_start = i
    // parse alt
    while (i < input.length) {
      if (input[i] === `]` && input[i + 1] === `(`) {
        break
      }
      i++
    }
    if (input[i - 1] === ` `) throw new Error(`too many spaces in "${input}"`)

    const alt = input.slice(alt_start, i)

    i += 2 // skip `](`

    if (input[i + 1] === ` `) throw new Error(`too many spaces in "${input}"`)

    // parse url
    const url_start = i
    let title_exists = false
    while (i < input.length) {
      if (input[i] === `)`) {
        break
      }
      if (input[i] === ` `) {
        if (url_start === i) throw new Error(`too many spaces in "${input}"`)
        title_exists = true
        break
      }
      i++
    }

    const src = input.slice(url_start, i)
    i++

    /** @type {Attr} */
    const attr = map({
      loading: `lazy`,
      decoding: `async`,
      src: src,
      alt: alt,
    })

    if (title_exists) {
      const title_open = input[i]
      if (![`'`, `"`].includes(title_open)) throw new Error(`invalid ![img]() title open in "${input}"`)
      i++

      if (input[i] === ` `) throw new Error(`too many spaces in "${input}"`)

      const title_start = i
      while (true) {
        if (i > input.length - 1) throw new Error(`invalid ![img]() title close in "${input}"`)
        if (input[i] === title_open && input[i + 1] === `)`) {
          break
        }
        i++
      }

      if (input[i - 1] === ` `) throw new Error(`too many spaces in "${input}"`)

      const title = input.slice(title_start, i)
      attr.set(`title`, title)
      i += 2
    }

    const img = node({ name: `img`, type: `block`, attr })
    return { child: img, i }
  }

  /**
   * e.g. [link](https://example.com)
   * @param {string} input
   * @param {number} i
   * @returns {{child: Node, i: number}}
   */
  function link(input, i) {
    let start = i
    let text_start = i
    const child = node({ name: `a`, type: `inline` })
    while (i < input.length) {
      if (input[i] === `\\`) {
        i += 2
        continue
      }
      // code はネストして良い
      if (input[i] === "`") {
        // もしそこまでに text があったら
        // (e.g. "aaa `code`")
        if (text_start < i) {
          child.addText(input.slice(text_start, i))
        }
        const inline_code = code(input, i + 1)
        text_start = i = inline_code.i
        child.appendChild(inline_code.child)
        continue
      }
      // 中に [] がネストしてる場合だけ text 扱い
      if (input[i] === `[`) {
        while (input[i] !== `]`) {
          i++
        }
        i++
      }

      if (input[i] === `]`) {
        if (input[i + 1] === `(`) {
          break
        } else {
          // 実はリンクじゃなかった (e.g. "this is [not] link")
          const child = node({ name: `text`, type: `inline`, text: input.slice(text_start - 1, i) })
          return { child, i }
        }
      }
      i++
    }

    // link だったことがわかったのでここで空白判定
    if (input[start] === ` `) throw new Error(`too many spaces in "${input}"`)
    if (input[i - 1] === ` `) throw new Error(`too many spaces in "${input}"`)

    const text = input.slice(text_start, i)
    i += 2 // skip `](`
    const url_start = i

    if (input[i] === ` `) throw new Error(`too many spaces in "${input}"`)

    while (i < input.length) {
      if (input[i] === `\\`) {
        i += 2
        continue
      }
      if (input[i] === `)`) {
        break
      }
      i++
    }

    if (input[i - 1] === ` `) throw new Error(`too many spaces in "${input}"`)

    const href = input.slice(url_start, i)
    i++ // skip `)`
    child.attr = map({ href })
    child.addText(text)
    return { child, i }
  }

  /**
   * e.g. <https://example.com>
   * @param {string} input
   * @param {number} i
   */
  function short_link(input, i) {
    const url_start = i
    while (true) {
      if (i > input.length - 1) {
        // 実際は Link じゃなかったので text として処理 (e.g.  10 < 20)
        const text = `<${input.slice(url_start, i)}`
        const child = node({ name: `text`, type: `inline`, text })
        return { child, i }
      }
      if (input[i] === `>`) {
        break
      }
      i++
    }

    if (input[url_start] === ` `) throw new Error(`too many spaces in "${input}"`)
    if (input[i - 1] === ` `) throw new Error(`too many spaces in "${input}"`)

    const href = input.slice(url_start, i)
    const attr = map({ href })
    const child = node({ name: `a`, type: `inline`, attr })
    child.addText(href)

    i++ // skip `>`

    return { child, i }
  }

  /**
   * e.g. go to https://example.com page
   * e.g. example page (https://example.com)
   * @param {string} input
   * @param {number} i
   * @returns {{child: Node, i: number}}
   */
  function smart_link(input, i) {
    const url_start = i
    while (i < input.length) {
      if ([` `, `)`].includes(input[i])) {
        break
      }
      i++
    }
    const href = input.slice(url_start, i)
    const attr = map({ href })
    const child = node({ name: `a`, type: `inline`, attr })
    child.addText(href)
    return { child, i }
  }

  /**
   * @param {string} input
   * @param {number} i
   * @returns {{child: Node, i: number}}
   */
  function em(input, i) {
    let text_start = i
    const child = node({ name: `em`, type: `inline` })
    while (true) {
      // "* a * b *" みたいにマッチしてない場合
      if (i > input.length) throw new Error(`unmatched </em> on "${input}"`)

      // escape を無視
      if (input[i] === `\\`) {
        i += 2
        continue
      }

      // 終了
      if (input[i] === `*`) break

      // code はネストして良い
      if (input[i] === "`") {
        // もしそこまでに text があったら
        // (e.g. "aaa `code`")
        if (text_start < i) {
          child.addText(input.slice(text_start, i))
        }
        const inline_code = code(input, i + 1)
        text_start = i = inline_code.i
        child.appendChild(inline_code.child)
        continue
      }
      i++
    }
    if (input[i - 1] === ` `) throw new Error(`too many spaces in "${input}"`)
    if (text_start < i) child.addText(input.slice(text_start, i))
    return { child, i: i + 1 }
  }

  /**
   * @param {string} input
   * @param {number} i
   * @returns {{child: Node, i: number}}
   */
  function strong(input, i) {
    let text_start = i
    const child = node({ name: `strong`, type: `inline` })
    while (true) {
      // "** a" みたいにマッチしてない場合
      if (i > input.length) throw new Error(`unmatched </strong> on "${input}"`)

      // escape を無視
      if (input[i] === `\\`) {
        i += 2
        continue
      }

      // 終了
      if (input[i] === `*` && input[i + 1] === `*`) break

      // code はネストして良い
      if (input[i] === "`") {
        // もしそこまでに text があったら
        // (e.g. "aaa `code`")
        if (text_start < i) {
          child.addText(input.slice(text_start, i))
        }
        const inline_code = code(input, i + 1)
        text_start = i = inline_code.i
        child.appendChild(inline_code.child)
        continue
      }
      i++
    }
    if (input[i - 1] === ` `) throw new Error(`too many spaces in "${input}"`)
    if (text_start < i) child.addText(input.slice(text_start, i))
    return { child, i: i + 2 }
  }

  /**
   * @param {string} input
   * @param {number} i
   * @returns {{child: Node, i: number}}
   */
  function code(input, i) {
    const text_start = i
    const attr = map({ translate: `no` })
    const child = node({ name: `code`, type: `inline`, attr })
    while (true) {
      // "` a ` b `" みたいにマッチしてない場合
      if (i > input.length) throw new Error(`unmatched </code> on "${input}"`)

      // escape を無視
      if (input[i] === `\\`) {
        i += 2
        continue
      }

      // 終了
      if (input[i] === "`") break

      // ネストは許可しない

      i++
    }
    if (input[i - 1] === ` `) throw new Error(`too many spaces in "${input}"`)
    if (text_start < i) child.addText(input.slice(text_start, i))
    return { child, i: i + 1 }
  }

  /**
   * @param {string} input
   * @param {number} _i
   * @returns {{child: Node, i: number}}
   */
  function inline_blockquote(input, _i) {
    const { children, i } = inline_parse(input, _i)
    const p = node({ name: `p`, type: `inline`, children })
    const child = node({ name: `blockquote`, type: `block` })
    child.appendChild(p)
    return { child, i }
  }

  /**
   * @param {Array.<string>} lines
   * @param {Node} ast
   * @returns {Node}
   */
  function parse(lines, ast = node({ name: `root`, type: `block`, level: 0 })) {
    // proceed all lines
    if (lines.length === 0) return rise(ast, `root`)

    const [head, ...rest] = lines

    /**@type {RegExpExecArray} */
    let result

    // pre ((?<sp2> *)(?<after>.*))?
    if (result = /^```(?<lang>.*?)((:)(?<path>.*))?$/.exec(head)) return pre(result, rest, ast)

    // pre 中は各行を children にそのまま追加
    if (ast.name === `pre`) {
      ast.addText(head)
      return parse(rest, ast)
    }

    // details open
    if (result = /^:::((?<symbol>.+?)((?<spaces> +)(?<text>.*))*){0,1}$/.exec(head)) return details(result, rest, ast)

    // html
    if (result = /^( *)\<(\/{0,1})(iframe|div|span|p|pre|code|\!--).*/.exec(head)) {
      return html(result, rest, ast)
    }

    // skip break line
    if (head === ``) return parse(rest, rise(ast, `section`))

    if (result = /^(?<symbol>#+)(?<spaces> +)(?<text>.+)$/.exec(head)) /*           */ return heading(result, rest, ast)
    if (result = /^(?<indent> *)(?<number>\d+)\.(?<spaces> +)(?<text>.+)$/.exec(head)) return list(`ol`, result, rest, ast)
    if (result = /^(?<indent> *)\-(?<spaces> +)(?<text>.+)$/.exec(head)) /*         */ return list(`ul`, result, rest, ast)
    if (result = /^(\:)(?<spaces> +)(?<text>.+)$/.exec(head)) /*                    */ return dl(result, rest, ast)
    if (result = /^(\>)(?<spaces> +)(?<text>.+)$/.exec(head)) /*                    */ return blockquote(result, rest, ast)
    if (result = /^Caption: (?<caption>.+)$/.exec(head)) /*                         */ return table_caption(result, rest, ast)
    if (result = /^\|(?<row>.*)\|$/.exec(head)) /*                                  */ return table(result, rest, ast)

    // space only line
    if (result = /^( *)$/.exec(head)) throw new Error(`space only line in "${head}"`)

    // rest are <p>
    return p(head, rest, ast)
  }

  const lines = md.split(`\n`)
  return parse(lines)
}

/**
 * @typedef {Object} Plugin
 * @property {function(Node): Node} enter
 * @property {function(Node): Node} leave
 */

/**
 * Traverse Node Tree
 * @param {Node} ast
 * @param {Plugin} plugin
 */
export function traverse(ast, plugin) {
  ast.children = ast.children.map((child) => {
    child = plugin.enter(child)
    child = traverse(child, plugin)
    child = plugin.leave(child)
    return child
  })
  return ast
}

/**
 * 指定した親ノードまで登る
 * Root に到達したら止まる
 * @param {Node} ast
 * @param {string} name
 * @returns {Node}
 */
function rise(ast, name) {
  while (ast.name !== `root` && ast.name !== name) {
    ast = ast.parent
  }
  return ast
}

/**
 * dump for debug
 * @param {Node} ast
 */
export function dump(ast) {
  console.log(JSON.stringify(ast, (key, value) => {
    if (key === `parent`) return undefined
    return value
  }, `  `))
}


function main() {
  [
`
<p>コメントの前
<!-- これはコメントです -->
<p>コメントの後
`,
  ].forEach((line) => {
    const ast = decode(line)
    dump(ast)
    const html = encode(ast, { indent: 2 })
    console.log(html)
  })
}
// main()
// const tmp = readFileSync("tmp.txt", "utf-8")
// console.log(encode(decode(tmp), { indent:2 }))
