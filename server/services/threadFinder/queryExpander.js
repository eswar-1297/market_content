// Query Expander - Rule-based query expansion for better search coverage
// Generates multiple search variants from a single user input

/**
 * Common synonyms and related terms for enterprise/tech queries
 */
const synonymMap = {
  // Communication tools
  'slack': ['slack', 'slack app', 'slack workspace'],
  'teams': ['teams', 'microsoft teams', 'ms teams'],
  'zoom': ['zoom', 'zoom meetings', 'zoom video'],
  'discord': ['discord', 'discord server'],
  
  // Actions
  'migrate': ['migrate', 'migration', 'move', 'transfer', 'switch', 'transition'],
  'import': ['import', 'importing', 'bring in'],
  'export': ['export', 'exporting', 'extract'],
  'integrate': ['integrate', 'integration', 'connect', 'sync'],
  'compare': ['compare', 'comparison', 'vs', 'versus', 'difference'],
  
  // Data types
  'messages': ['messages', 'chats', 'conversations', 'chat history'],
  'files': ['files', 'documents', 'attachments'],
  'channels': ['channels', 'groups', 'workspaces'],
  'users': ['users', 'members', 'team members', 'accounts'],
  
  // Common modifiers
  'best': ['best', 'top', 'recommended'],
  'how': ['how to', 'how do I', 'ways to', 'steps to'],
  'tools': ['tools', 'software', 'apps', 'solutions']
}

/**
 * Query templates for different question types
 * Includes recent/date variations to find newer threads
 */
const queryTemplates = [
  '{query}',                           // Original query
  'how to {query}',                    // How-to format
  '{query} guide',                     // Guide format
  '{query} tips',                      // Tips format
  'best way to {query}',               // Best practices
  '{query} problems',                  // Problem-focused
  '{query} experience',                // Experience sharing
  '{query} recommendations',           // Recommendations
  '{query} help',                      // Help format
  '{query} solution',                  // Solution format
  '{query} issue',                     // Issue format
  '{query} question',                  // Question format
  'can I {query}',                     // Can I format
  '{query} not working',               // Not working format
  '{query} alternatives',              // Alternatives
  '{query} 2025',                      // Recent year
  '{query} 2024',                      // Previous year
  '{query} recently',                  // Recent discussions
  '{query} new',                       // New discussions
  '{query} latest'                     // Latest discussions
]

/**
 * Expand a user query into multiple search variants
 * @param {string} query - The original user query
 * @param {number} maxVariants - Maximum number of variants to generate (default: 8)
 * @returns {string[]} Array of expanded query variants
 */
export function expandQuery(query, maxVariants = 8) {
  const variants = new Set()
  const normalizedQuery = query.toLowerCase().trim()
  
  // Always include the original query
  variants.add(normalizedQuery)
  
  // Generate template-based variants
  queryTemplates.forEach(template => {
    const expanded = template.replace('{query}', normalizedQuery)
    variants.add(expanded)
  })
  
  // Generate synonym-based variants
  const words = normalizedQuery.split(/\s+/)
  
  words.forEach((word, index) => {
    const synonyms = findSynonyms(word)
    if (synonyms.length > 0) {
      // Create variant with each synonym
      synonyms.slice(0, 2).forEach(synonym => {
        if (synonym !== word) {
          const newWords = [...words]
          newWords[index] = synonym
          variants.add(newWords.join(' '))
        }
      })
    }
  })
  
  // Generate rephrased variants for common patterns
  const rephrasedVariants = generateRephrases(normalizedQuery)
  rephrasedVariants.forEach(v => variants.add(v))
  
  // Convert to array and limit
  const result = Array.from(variants).slice(0, maxVariants)
  
  console.log(`📝 Query expansion: "${query}" -> ${result.length} variants`)
  result.forEach((v, i) => console.log(`   ${i + 1}. ${v}`))
  
  return result
}

/**
 * Find synonyms for a word
 */
function findSynonyms(word) {
  const lowerWord = word.toLowerCase()
  
  // Check direct matches
  if (synonymMap[lowerWord]) {
    return synonymMap[lowerWord]
  }
  
  // Check if word is in any synonym list
  for (const [key, synonyms] of Object.entries(synonymMap)) {
    if (synonyms.includes(lowerWord)) {
      return synonyms
    }
  }
  
  return []
}

/**
 * Generate rephrased variants based on common patterns
 */
function generateRephrases(query) {
  const variants = []
  
  // Pattern: "X to Y" -> many variations for migration queries
  const toPattern = /^(.+?)\s+to\s+(.+)$/i
  const toMatch = query.match(toPattern)
  if (toMatch) {
    const [, source, target] = toMatch
    variants.push(`from ${source} to ${target}`)
    variants.push(`${source} vs ${target}`)
    variants.push(`switching ${source} to ${target}`)
    variants.push(`${source} to ${target} migration`)
    variants.push(`move from ${source} to ${target}`)
    variants.push(`transfer ${source} to ${target}`)
    variants.push(`${source} ${target} sync`)
    variants.push(`${source} ${target} backup`)
    variants.push(`${source} ${target} copy files`)
    variants.push(`switch from ${source} to ${target}`)
    variants.push(`${source} alternative ${target}`)
    variants.push(`replace ${source} with ${target}`)
    variants.push(`${target} instead of ${source}`)
    variants.push(`moving files ${source} ${target}`)
    variants.push(`upload ${source} to ${target}`)
  }
  
  // Pattern: "migrate X to Y" -> variations
  const migratePattern = /^migrate\s+(.+?)\s+to\s+(.+)$/i
  const migrateMatch = query.match(migratePattern)
  if (migrateMatch) {
    const [, source, target] = migrateMatch
    variants.push(`${source} to ${target} migration`)
    variants.push(`moving ${source} to ${target}`)
    variants.push(`transfer ${source} to ${target}`)
    variants.push(`${source} ${target} migration guide`)
  }
  
  // Pattern: "how to X" -> "X tutorial", "X guide"
  const howToPattern = /^how\s+to\s+(.+)$/i
  const howToMatch = query.match(howToPattern)
  if (howToMatch) {
    const [, action] = howToMatch
    variants.push(`${action} tutorial`)
    variants.push(`${action} guide`)
    variants.push(`${action} steps`)
  }
  
  // Pattern: "X vs Y" -> "X compared to Y", "X or Y"
  const vsPattern = /^(.+?)\s+(?:vs|versus)\s+(.+)$/i
  const vsMatch = query.match(vsPattern)
  if (vsMatch) {
    const [, first, second] = vsMatch
    variants.push(`${first} compared to ${second}`)
    variants.push(`${first} or ${second}`)
    variants.push(`${first} ${second} comparison`)
    variants.push(`difference between ${first} and ${second}`)
  }
  
  return variants
}

/**
 * Build search queries with site: prefix for Quora
 * @param {string[]} variants - Array of query variants
 * @returns {string[]} Array of search-ready queries with site:quora.com prefix
 */
export function buildSearchQueries(variants) {
  return variants.map(variant => `site:quora.com ${variant}`)
}

/**
 * Build search queries with additional operators
 * @param {string} query - Single query variant
 * @returns {string[]} Array of queries with different operators
 */
export function buildAdvancedQueries(query) {
  return [
    `site:quora.com ${query}`,
    `site:quora.com intitle:${query.split(' ').slice(0, 3).join(' ')}`,
    `site:quora.com "${query}"`
  ]
}


