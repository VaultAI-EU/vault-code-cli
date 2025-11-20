import { describe, test, expect } from "bun:test"
import { SessionListCommand } from "../../src/cli/cmd/session"

describe("SessionCommand", () => {
  test("should have correct command structure", () => {
    expect(SessionListCommand.command).toBe("list")
    expect(SessionListCommand.describe).toBe("list all sessions with their IDs")
  })

  test("should have builder function", () => {
    expect(typeof SessionListCommand.builder).toBe("function")
  })

  test("should have handler function", () => {
    expect(typeof SessionListCommand.handler).toBe("function")
  })
})
