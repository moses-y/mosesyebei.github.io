const fs = require('fs');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Configuration
const CONFIG = {
  username: 'yebeai',
  reposToShow: 999, // All repos - no limit
  apiDelay: 1500, // ms between requests
  models: {
    endpoint: 'https://models.inference.ai.azure.com/chat/completions',
    model: 'gpt-4o', // GPT-4o - works with GitHub Models
    maxTokens: 2000, // In-depth blog articles
    temperature: 0.7
  }
};

// Curated Unsplash photo IDs for tech/coding themes
const unsplashPhotos = [
  '1461749280684-dccba630e2f6', // code on screen
  '1555066931-4365d14bab8c', // laptop code
  '1504639725590-34d0984388bd', // programming
  '1526374965328-7f61d4dc18c5', // abstract tech
  '1518770660439-4636190af475', // circuit board
  '1451187580459-43490279c0fa', // earth from space
  '1550751827-4bd374c3f58b', // server room
  '1558494949-ef010cbdcc31', // AI brain
  '1485827404703-89b55fcc595e', // robot
  '1531482615713-2afd69097998', // coding workspace
  '1542831371-29b0f74f9713', // code syntax
  '1607799279861-4dd421887fb3', // dark code
];

function getRandomUnsplashUrl(index) {
  const photoId = unsplashPhotos[index % unsplashPhotos.length];
  return `https://images.unsplash.com/photo-${photoId}?w=800&h=400&fit=crop&q=80`;
}

// Fetch README content from repo
async function fetchReadme(repo) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${CONFIG.username}/${repo.name}/readme`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3.raw',
          'User-Agent': 'GitHub-Pages-Blog-Generator',
          ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
        }
      }
    );

    if (response.ok) {
      const readme = await response.text();
      // Truncate to first 4000 chars for more context
      return readme.slice(0, 4000);
    }
  } catch (e) {
    console.log(`Could not fetch README for ${repo.name}`);
  }
  return null;
}

// Fetch repo file structure for context
async function fetchRepoTree(repo) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${CONFIG.username}/${repo.name}/git/trees/HEAD?recursive=1`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Pages-Blog-Generator',
          ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      // Get key files only (limit to 30)
      const files = (data.tree || [])
        .filter(f => f.type === 'blob')
        .map(f => f.path)
        .slice(0, 30);
      return files;
    }
  } catch (e) {
    console.log(`Could not fetch tree for ${repo.name}`);
  }
  return [];
}

async function generateBlogArticle(repo, readme, fileTree) {
  if (!GITHUB_TOKEN) {
    return generateFallbackSummary(repo);
  }

  try {
    const context = `
REPOSITORY: ${repo.name}
DESCRIPTION: ${repo.description || 'No description'}
PRIMARY LANGUAGE: ${repo.language || 'Not specified'}
TOPICS/TAGS: ${(repo.topics || []).join(', ') || 'None'}
STARS: ${repo.stargazers_count || 0}
${repo.parent ? `FORKED FROM: ${repo.parent.name} (${repo.parent.stars} stars)` : 'ORIGINAL PROJECT'}

FILE STRUCTURE:
${fileTree.length > 0 ? fileTree.join('\n') : 'Not available'}

README EXCERPT:
${readme || 'No README available'}
`.trim();

    const prompt = `You are a tech blogger writing an insightful article about a GitHub repository. Based on the repository data below, write a compelling blog-style analysis.

${context}

Write an in-depth technical blog article (4-5 paragraphs) that:

1. HOOK: Start with a compelling problem statement or use case this project addresses
2. WHAT IT IS: Explain the project's purpose, core functionality, and what makes it unique
3. TECHNICAL DEEP DIVE: Analyze the architecture, key technologies, design patterns, or implementation details you can identify from the file structure and README
4. USE CASES: Describe 2-3 specific scenarios where a developer would benefit from this
5. TAKEAWAY: End with an insight about the broader technology landscape or why this matters

Style guidelines:
- Write as a senior engineer sharing deep technical insights
- Reference specific files, modules, or patterns visible in the codebase
- Explain the "why" behind technical decisions when apparent
- No emojis, no fluff, no generic statements
- Be opinionated - share what's impressive or what could be improved
- If forked, explain what the upstream project is known for and why it's significant

Write the full article, no title or headers:`;

    const response = await fetch(CONFIG.models.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: CONFIG.models.model,
        messages: [
          {
            role: 'system',
            content: 'You are a senior developer and tech writer who creates insightful, well-researched blog content about open source projects.'
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: CONFIG.models.maxTokens,
        temperature: CONFIG.models.temperature
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`AI API returned ${response.status}: ${errorText.slice(0, 100)}`);
      return generateFallbackSummary(repo);
    }

    const data = await response.json();
    const article = data.choices?.[0]?.message?.content?.trim();

    if (article && article.length > 100) {
      return article;
    }

    return generateFallbackSummary(repo);
  } catch (error) {
    console.log(`AI generation failed for ${repo.name}:`, error.message);
    return generateFallbackSummary(repo);
  }
}

function generateFallbackSummary(repo) {
  const desc = repo.description || '';
  const lang = repo.language || 'various technologies';
  const name = repo.name.replace(/-/g, ' ').replace(/_/g, ' ');

  if (desc.length > 100) {
    return `${desc}\n\nThis ${lang} project caught my attention for its practical approach to solving real developer problems. The codebase offers patterns worth studying for anyone working in this space.`;
  }

  return `${name} is a ${lang} project that demonstrates thoughtful software design. While exploring the codebase, I found patterns and implementations that could accelerate similar projects. Worth investigating if you're working with ${lang} or interested in clean, maintainable code architecture.`;
}

async function fetchRepos() {
  let allRepos = [];
  let page = 1;

  // Paginate through all repos (GitHub API returns max 100 per page)
  while (true) {
    const response = await fetch(
      `https://api.github.com/users/${CONFIG.username}/repos?sort=updated&per_page=100&page=${page}`,
      {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitHub-Pages-Blog-Generator',
          ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
        }
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const repos = await response.json();

    if (repos.length === 0) break;

    allRepos = allRepos.concat(repos);
    console.log(`Fetched page ${page}: ${repos.length} repos (total: ${allRepos.length})`);

    if (repos.length < 100) break; // Last page
    page++;
  }

  allRepos.forEach(r => {
    r._type = r.fork ? 'fork' : 'original';
  });

  const all = allRepos
    .filter(r => !r.name.includes('.github.io'))
    .filter(r => !r.archived)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

  return all;
}

async function fetchRepoDetails(repo) {
  try {
    const response = await fetch(repo.url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitHub-Pages-Blog-Generator',
        ...(GITHUB_TOKEN && { 'Authorization': `token ${GITHUB_TOKEN}` })
      }
    });

    if (response.ok) {
      const data = await response.json();
      return {
        ...repo,
        topics: data.topics || [],
        parent: data.parent ? {
          name: data.parent.full_name,
          url: data.parent.html_url,
          stars: data.parent.stargazers_count
        } : null
      };
    }
  } catch (e) {
    console.log(`Could not fetch details for ${repo.name}`);
  }
  return repo;
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function estimateReadTime(content) {
  const words = (content || '').split(/\s+/).length;
  return Math.max(2, Math.ceil(words / 200));
}

async function main() {
  console.log('Fetching repositories...');

  const repos = await fetchRepos();
  const forkCount = repos.filter(r => r._type === 'fork').length;
  const ownedCount = repos.filter(r => r._type === 'original').length;
  console.log(`Found ${repos.length} repos (${forkCount} forks, ${ownedCount} original)`);

  const recentForks = repos.slice(0, CONFIG.reposToShow);

  console.log('Fetching repo details, READMEs, and generating blog articles...');

  const forks = [];

  for (let i = 0; i < recentForks.length; i++) {
    const repo = recentForks[i];
    console.log(`Processing ${i + 1}/${recentForks.length}: ${repo.name}`);

    // Fetch all context in parallel
    const [detailed, readme, fileTree] = await Promise.all([
      fetchRepoDetails(repo),
      fetchReadme(repo),
      fetchRepoTree(repo)
    ]);

    console.log(`  - README: ${readme ? `${readme.length} chars` : 'not found'}`);
    console.log(`  - Files: ${fileTree.length} discovered`);

    // Generate blog article with full context
    const article = await generateBlogArticle(detailed, readme, fileTree);
    console.log(`  - Article: ${article.length} chars generated`);

    forks.push({
      id: repo.id,
      name: repo.name,
      displayName: repo.name.replace(/-/g, ' ').replace(/_/g, ' '),
      description: repo.description || 'No description available',
      summary: article, // In-depth blog article
      url: repo.html_url,
      language: repo.language,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      topics: detailed.topics || [],
      parent: detailed.parent || null,
      type: repo._type || 'fork',
      image: getRandomUnsplashUrl(i),
      forkedAt: formatDate(repo.created_at),
      updatedAt: formatDate(repo.updated_at),
      readTime: estimateReadTime(article)
    });

    // Rate limiting delay
    await new Promise(r => setTimeout(r, CONFIG.apiDelay));
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    generatedWith: 'GitHub Models API (GPT-4o)',
    forks
  };

  fs.writeFileSync('forks.json', JSON.stringify(output, null, 2));
  console.log(`Generated forks.json with ${forks.length} blog articles`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
