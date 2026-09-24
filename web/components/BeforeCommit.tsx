import { Component } from 'react'

/**
 * Calls `capture` in the commit, just before React changes the DOM for an
 * update in which `watch` changed. Function components have no hook for that
 * moment, and a FLIP animation needs it: it is the last chance to read where
 * things are on screen, running animations included, before they move.
 */
export class BeforeCommit extends Component<{ watch: unknown; capture: () => void }> {
  getSnapshotBeforeUpdate(prev: { watch: unknown }) {
    if (prev.watch !== this.props.watch) this.props.capture()
    return null
  }

  // React requires this beside getSnapshotBeforeUpdate.
  componentDidUpdate() {}

  render() {
    return null
  }
}
