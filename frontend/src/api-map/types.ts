export type Ctx = {
  path: string
  method: string
  query: Record<string, unknown>
  body: Record<string, unknown>
  params: string[]
}
export type Handler = (ctx: Ctx) => Promise<unknown>
export type Route = { method: string; match: string | RegExp; handle: Handler }
