#!/usr/bin/env bun
/**
 * GitHub Code Search via grep.app API
 *
 * Usage:
 *   bun run skills/github-code-search/scripts/search.ts "query" [--lang=TypeScript] [--repo=owner/repo] [--limit=10] [--regexp]
 *
 * Examples:
 *   bun run skills/github-code-search/scripts/search.ts "use cache"
 *   bun run skills/github-code-search/scripts/search.ts "cacheLife" --lang=TypeScript --repo=vercel/next.js
 *   bun run skills/github-code-search/scripts/search.ts "async.*await" --regexp --limit=5
 */

interface SearchOptions {
  query: string
  language?: string
  repo?: string
  limit: number
  regexp: boolean
}

interface CodeMatch {
  repo: string
  path: string
  url: string
  matches: Array<{
    lineNumber: number
    content: string
  }>
}

interface SearchResult {
  query: string
  options: Omit<SearchOptions, 'query'>
  total: number
  results: CodeMatch[]
}

function parseArgs(): SearchOptions {
  const args = process.argv.slice(2)
  const options: SearchOptions = {
    query: '',
    limit: 10,
    regexp: false,
  }

  for (const arg of args) {
    if (arg.startsWith('--lang=')) {
      options.language = arg.slice(7)
    } else if (arg.startsWith('--repo=')) {
      options.repo = arg.slice(7)
    } else if (arg.startsWith('--limit=')) {
      options.limit = parseInt(arg.slice(8), 10)
    } else if (arg === '--regexp') {
      options.regexp = true
    } else if (!arg.startsWith('--')) {
      options.query = arg
    }
  }

  return options
}

async function searchGitHub(options: SearchOptions): Promise<SearchResult> {
  const { query, language, repo, limit, regexp } = options

  if (!query) {
    throw new Error('Query is required. Usage: search.ts "query" [--lang=Language] [--repo=owner/repo]')
  }

  // Build URL parameters
  const params = new URLSearchParams()
  params.append('q', query)
  if (language) params.append('l', language)
  if (repo) params.append('r', repo)
  if (regexp) params.append('regexp', 'true')

  const url = `https://grep.app/api/search?${params.toString()}`

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Claude-Code-Skill/1.0',
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`grep.app API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Process and filter results locally (this is the "code mode" efficiency gain)
  const results: CodeMatch[] = (data.hits?.hits || []).slice(0, limit).map((hit: any) => {
    const repoName = hit.repo || 'unknown'
    const filePath = hit.path || 'unknown'
    const branch = hit.branch || 'HEAD'

    // Parse the content snippet - it's HTML table format from grep.app
    const snippet = hit.content?.snippet || ''

    // Extract lines from the HTML table structure
    // Format: <tr data-line="N"><td>...<td><div class="highlight"><pre>CODE</pre></div></td></tr>
    const lineMatches = [...snippet.matchAll(/data-line="(\d+)"[^>]*>.*?<pre[^>]*>(.*?)<\/pre>/gs)]

    const lines = lineMatches.slice(0, 8).map((match) => {
      const lineNum = parseInt(match[1], 10)
      let content = match[2]
        .replace(/<mark>/g, '»') // Mark search matches
        .replace(/<\/mark>/g, '«')
        .replace(/<[^>]*>/g, '') // Strip HTML tags
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim()

      return { lineNumber: lineNum, content }
    })

    return {
      repo: repoName,
      path: filePath,
      url: `https://github.com/${repoName}/blob/${branch}/${filePath}`,
      matches: lines.filter((l) => l.content.length > 0),
    }
  })

  return {
    query,
    options: { language, repo, limit, regexp },
    total: data.hits?.total || 0,
    results,
  }
}

async function main() {
  try {
    const options = parseArgs()
    const result = await searchGitHub(options)

    // Output formatted JSON for easy parsing
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
    process.exit(1)
  }
}

main()
