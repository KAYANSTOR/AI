/**
 * Ambient types for the `bun:test` API this suite uses.
 *
 * The tests run with `bun test` (Bun is the workspace package manager, so a test
 * runner needs no new dependency). TypeScript does not know the `bun:test` module
 * unless `bun-types` is installed, and installing it would mean adding a dependency
 * and regenerating the npm lockfile that CI's `npm ci` validates.
 *
 * This declares only the surface actually used, so the tests are still typechecked
 * rather than excluded from the build.
 */
declare module 'bun:test' {
  type TestBody = () => void | Promise<void>

  export function describe(label: string, body: TestBody): void
  export function test(label: string, body: TestBody): void
  export function it(label: string, body: TestBody): void
  export function beforeEach(body: TestBody): void
  export function afterEach(body: TestBody): void
  export function beforeAll(body: TestBody): void
  export function afterAll(body: TestBody): void

  export interface Matchers<T> {
    toBe(expected: T): void
    toEqual(expected: unknown): void
    toContain(expected: unknown): void
    toHaveProperty(key: string, value?: unknown): void
    toBeTruthy(): void
    toBeFalsy(): void
    toBeNull(): void
    toBeUndefined(): void
    toBeDefined(): void
    toBeGreaterThan(expected: number): void
    toBeLessThan(expected: number): void
    toBeInstanceOf(expected: abstract new (...args: never[]) => unknown): void
    toThrow(expected?: unknown): void
    /** For `expect(promise).rejects.toThrow(...)`. */
    rejects: Matchers<unknown>
    /** For `expect(promise).resolves.toBe(...)`. */
    resolves: Matchers<unknown>
  }

  export interface Expectation<T> extends Matchers<T> {
    not: Matchers<T>
  }

  export function expect<T = unknown>(actual: T): Expectation<T>
}
