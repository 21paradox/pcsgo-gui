#!/bin/env node
import init from './render'
import minimist from 'minimist'

async function main() {
  const argv = minimist(process.argv.slice(2));
  if (argv.pcsbin) {
    init({
      pcsbin: argv.pcsbin
    })
  }
  return
}

main()