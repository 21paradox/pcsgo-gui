import React, { Fragment, useEffect, useReducer, useRef } from "react"
// @ts-ignore
import blessed from "blessed"
import { render } from "react-blessed"
import pty from "node-pty"
import { EventEmitter } from "events"
import Parser from "table-parser"
import lodash from "lodash"

function initState() {
  return {
    logtxt: "",
    contentStr: "",
    onDataCb: (a: string) => {},
    fileArr: [] as {
      idx: string
      fileSize: string
      updateDate: string
      filePath: string
    }[],
    fileAoa: [["filePath", "updateDate", "fileSize"]],
    selectedIdx: NaN,
  }
}
export type State = ReturnType<typeof initState>
export type Action =
  | {
      type: "append-log"
      payload: string
    }
  | Partial<State>
export type Dispatch = React.Dispatch<Action>

const dirBeginPfx = /当前目录: .+\r\n----/
// const dirBeginPfx = /当前目录/
const dirEndPfx = /当前目录: .+\r\n/
const dirEndPad = /----\r\n$/

function reducer(state: State, action: Action) {
  if ("type" in action) {
    if (action.type === "append-log") {
      const logtxt = state.logtxt + action.payload
      const matched = logtxt.match(dirBeginPfx)
      // screen.debug(matched, "mm")

      const buildTable = (contentStr: string) => {
        const parsed = Parser.parse(contentStr)
        const fileArr: State["fileArr"] = []
        const fileAoa = [["filePath", "updateDate", "fileSize"]]

        parsed.forEach((item: any, i: number) => {
          if (Number(item["#"][0]) === i) {
            const obj = {
              idx: item["#"][0],
              fileSize: item["#"][1],
              updateDate: item["#"].slice(2).join(" "),
              filePath: item["文件(目录)"].join(" "),
            }
            fileArr.push(obj)
            fileAoa.push([obj.filePath, obj.updateDate, obj.fileSize])
          }
        })
        return {
          fileArr,
          fileAoa,
        }
      }

      if (matched) {
        let contentStr = logtxt
          .substring(matched.index || 0)
          .replace(dirBeginPfx, "")
        contentStr = contentStr.replace(dirEndPad, "")
        contentStr = contentStr.replace(/^(\r?\n)+/, "")
        return {
          ...state,
          logtxt: logtxt,
          contentStr: contentStr,
          ...buildTable(contentStr),
        }
      }
      return {
        ...state,
        logtxt,
        contentStr: logtxt,
        ...buildTable(logtxt),
      }
    }
  }
  return {
    ...state,
    ...action,
  }
}

const freshData = lodash.debounce((data, reflt, screen) => {
  reflt.current.setData(data)
  screen.render()
}, 400)

const App = (screen: any, pcsbin: string) => {
  const [state, dispatch] = useReducer(reducer, {}, initState) as [
    State,
    Dispatch,
  ]
  const refManager = useRef(null)
  const ee = new EventEmitter()
  const ondataCb = useRef((a: string) => {})
  const reflt = useRef<any>(null)
  const pcsRef = useRef<any>(null)

  useEffect(() => {
    const pcs = pty.spawn(pcsbin, [], {
      // shell: true,
    })
    pcs.onData((d) => {
      // dispatch({
      //   type: "append-log",
      //   payload: d,
      // })
      ondataCb.current(d)
    })
    pcsRef.current = pcs

    setTimeout(() => {
      ondataCb.current = (d) => {
        dispatch({
          type: "append-log",
          payload: d,
        })
      }
      pcs.write("ls\n")
    }, 2000)
    // refManager.current.refresh()
    reflt.current.focus()
  }, [])

  useEffect(() => {
    freshData(state.fileAoa, reflt, screen)
  }, [state.fileAoa])

  useEffect(() => {
    const onSelect = (item) => {
      const idx = reflt.current.getItemIndex(item)
      // screen.debug(idx, "mm")
      // screen.debug(state.fileArr[idx - 1])
    }
    reflt.current.on("select", onSelect)
    const onMove = (ch, key: any) => {
      if (key.name === "space") {
        if (typeof reflt.current.selected === "number") {
          const selectedIdx = reflt.current.selected - 1
          dispatch({
            selectedIdx,
          })
        }
        // console.log(selected, "selected")
        // const idx = reflt.current.getItemIndex(selected)
        // console.log(idx, "idx")
      }
    }
    reflt.current.on("keypress", onMove)
    return () => {
      reflt.current.off("select", onSelect)
      reflt.current.off("keypress", onMove)
    }
  }, [state])

  return (
    <Fragment>
      {/* <box
        label="inner box"
        left="0%"
        width="60%"
        height="40%"
        border={{ type: "line" }}
      ></box>
      <box
        label="inner box"
        left="40%"
        width="60%"
        height="40%"
        border={{ type: "line" }}
      >
        <listtable
          parent={screen}
          mouse={true}
          width="100%"
          height="100%"
          pad={2}
          keys={true}
          vi={true}
          style={{
            selected: {
              bg: "red",
            },
          }}
          data={[
            [""],
            [` {blue-fg}${process.env.HOME}{/blue-fg} `],
            ["hello"],
            ["Elephant"],
            ["Bird"],
            ["Elephant"],
            ["Bird"],
            ["Elephant"],
            ["Bird"],
          ]}
        ></listtable>
      </box> */}

      {/* 
      <box
        {...{
          parent: screen,
          top: "40%",
          left: "0",
          width: "50%",
          height: "50%",
          border: "line",
          tags: true,
          keys: true,
          vi: true,
          mouse: true,
          scrollable: true,
          alwaysScroll: true,
        }}
      >
      </box> */}

      {/* <log
        {...{
          top: "40%",
          left: "0%",
          width: "50%",
          height: "50%",
          border: "line",
          tags: true,
          keys: true,
          vi: true,
          mouse: true,
          scrollable: true,
          alwaysScroll: true,
          content: state.contentStr,
        }}
      ></log> */}

      <box
        {
          ...{
            // label: "Operation",
            // border: "line",
            // width: "100%",
            // height: 5,
          }
        }
      >
        <button
          {...{
            mouse: true,
            keys: true,
            border: { type: "line" },
            // width: 10,
            // height: 5,
            shrink: true,
            padding: {
              top: 0,
              bottom: 0,
              left: 1,
              right: 1,
            },
            top: 0,
            left: 0,
            content: "Back",
          }}
        ></button>
        <text
          {...{
            shrink: true,
            border: { type: "none" },
            padding: {
              top: 0,
              bottom: 0,
              left: 1,
              right: 1,
            },
            left: 10,
          }}
        >
          {Number.isInteger(state.selectedIdx)
            ? `selected: ${state.fileArr[state.selectedIdx].filePath}`
            : `selected: `}
        </text>
        <button
          {...{
            mouse: true,
            keys: true,
            border: { type: "line" },
            shrink: true,
            padding: {
              top: 0,
              bottom: 0,
              left: 1,
              right: 1,
            },
            top: 0,
            right: 20,
            content: "Download",
            onPress() {
              ondataCb.current = (d) => {
                screen.debug(d)
              }
              if (Number.isInteger(state.selectedIdx)) {
                pcsRef.current.write(
                  `download ${state.fileArr[state.selectedIdx].filePath} \n`,
                )
              }
            },
          }}
        ></button>
      </box>

      <listtable
        ref={reflt}
        {...{
          parent: screen,
          mouse: true,
          top: 3,
          left: 0,
          width: "80%",
          height: "70%",
          border: "line",
          tags: true,
          keys: true,
          vi: true,
          style: {
            border: {
              fg: "#fff",
            },
            header: {
              fg: "green",
              bold: true,
            },
            cell: {
              fg: "#fff",
              selected: {
                bg: "blue",
              },
            },
          },
        }}
      ></listtable>
    </Fragment>
  )
}

// var fm = blessed.filemanager({
//   parent: screen,
//   border: 'line',
//   style: {
//     selected: {
//       bg: 'blue'
//     }
//   },
//   height: 'half',
//   width: 'half',
//   top: 'center',
//   left: 'center',
//   label: ' {blue-fg}%path{/blue-fg} ',
//   cwd: process.env.HOME,
//   keys: true,
//   vi: true,
//   scrollbar: {
//     bg: 'white',
//     ch: ' '
//   }
// })

// screen.render();
// fm.refresh();

export default (args: { pcsbin: string }) => {
  const screen = blessed.screen({
    smartCSR: true,
    title: "react-blessed hooks demo",
    fullUnicode: true,
    debug: true,
  })
  screen.key(["escape", "q", "C-c"], function (ch, key) {
    return process.exit(0)
  })

  const App1 = App.bind(null, screen, args.pcsbin)
  render(<App1 />, screen)
}
