import OpenAI from 'openai'

let _client: OpenAI | undefined

export function getOpenAIClient(): OpenAI {
  if (!_client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('Missing OpenAI config: OPENAI_API_KEY must be set')
    }
    _client = new OpenAI({ apiKey })
  }
  return _client
}
