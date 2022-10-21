import React, {
  Fragment,
  useCallback,
  useEffect,
  useReducer,
  useRef,
} from "react"
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
    curFolder: "",
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

const dirBeginPfx = /当前目录: (.+)\r\n----/
// const dirBeginPfx = /当前目录/
const dirEndPfx = /当前目录: .+\r\n/
const dirEndPad = /----\r\n$/

function reducer(state: State, action: Action) {
  if ("type" in action) {
    if (action.type === "append-log") {
      const logtxt = state.logtxt + action.payload
      const matched = logtxt.match(dirBeginPfx)

      const buildTable = (contentStr: string) => {
        const fileAoa = [["filePath", "updateDate", "fileSize"]]
        if (!matched) {
          return {
            fileArr: [],
            fileAoa,
            curFolder: "",
          }
        }

        const parsed = Parser.parse(contentStr)
        const fileArr: State["fileArr"] = []

        const curFolder = matched?.[1] || ""

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
          curFolder,
        }
      }

      if (matched) {
        let contentStr = logtxt
          .substring(matched.index || 0)
          .replace(dirBeginPfx, "")
        // screen.debug(curFolder)
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
  reflt.current.focus()
}, 1000)

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
    pcs.write("cd / \n")
    pcs.onData((d) => {
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
    // reflt.current.focus()
  }, [])

  useEffect(() => {
    freshData(state.fileAoa, reflt, screen)
  }, [state.fileAoa])

  const onBack = useCallback(async () => {
    if (state.curFolder === "/") {
      return
    }
    const onNext = new Promise((resolve) => {
      ondataCb.current = (d) => {
        resolve(1)
      }
    })
    pcsRef.current.write(`cd ../ \n`)

    await onNext
    dispatch({
      logtxt: "",
    })
    ondataCb.current = (d) => {
      dispatch({
        type: "append-log",
        payload: d,
      })
    }
    pcsRef.current.write(`ls \n`)
  }, [state])

  useEffect(() => {
    const onSelect = (item) => {
      const idx = reflt.current.getItemIndex(item)
      const v = state.fileArr[idx - 1]
      // screen.debug(idx, "mm")
      // screen.debug(state.fileArr[idx - 1])
      ondataCb.current = (d) => {
        screen.debug(d)
      }
      if (Number.isInteger(state.selectedIdx)) {
        pcsRef.current.write(`cd ${v.filePath} \n`)
      }
    }
    // reflt.current.on("select", onSelect)
    const onMove = async (ch, key: any) => {
      screen.debug(key.name)
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
      } else if (key.name === "enter") {
        if (typeof reflt.current.selected === "number") {
          const selectedIdx = reflt.current.selected - 1
          const v = state.fileArr[selectedIdx]
          if (!v) {
            return
          }

          const onNext = new Promise((resolve) => {
            ondataCb.current = (d) => {
              screen.debug(d)
              resolve(1)
            }
          })
          screen.debug(`cd '${v.filePath}' \n`)
          pcsRef.current.write(`cd '${v.filePath}' \n`)

          await onNext
          dispatch({
            logtxt: "",
          })
          ondataCb.current = (d) => {
            screen.debug(d)
            dispatch({
              type: "append-log",
              payload: d,
            })
          }
          pcsRef.current.write(`ls \n`)
        }
      } else if (key.name === "b") {
        onBack()
      }
    }
    reflt.current.on("keypress", onMove)
    return () => {
      // reflt.current.off("select", onSelect)
      reflt.current.off("keypress", onMove)
    }
  }, [state])

  return (
    <Fragment>
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
            async onPress() {
              onBack()
            },
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
            ? `selected: ${state.fileArr?.[state.selectedIdx]?.filePath}`
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

        <text
          {...{
            shrink: true,
            border: { type: "none" },
            top: 3,
            left: 0,
          }}
        >
          {`folder: ${state.curFolder}`}
        </text>
      </box>

      <listtable
        ref={reflt}
        {...{
          parent: screen,
          mouse: true,
          top: 5,
          left: 0,
          width: "90%",
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
