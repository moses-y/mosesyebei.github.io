const fs = require('fs');

const GITHUB_USERNAME = 'moses-y';
const FORKS_TO_SHOW = 12;

// Topic to Unsplash keyword mapping for relevant images
const topicKeywords = {
  'ai': 'artificial-intelligence',
  'machine-learning': 'machine-learning',
  'python': 'code',
  'javascript': 'programming',
  'typescript': 'technology',
  'react': 'web-development',
  'data': 'data-visualization',
  'blockchain': 'blockchain',
  'crypto': 'cryptocurrency',
  'web': 'website',
  'mobile': 'mobile-app',
  'game': 'gaming',
  'security': 'cybersecurity',
  'cloud': 'cloud-computing',
  'database': 'database',
  'api': 'technology',
  'automation': 'robot',
  'bot': 'robot',
  'agent': 'artificial-intelligence',
  'llm': 'artificial-intelligence',
  'gpt': 'artificial-intelligence',
  'neural': 'neural-network',
  'deep-learning': 'neural-network'
};

function getImageKeyword(repo) {
  const text = `${repo.name} ${repo.description || ''} ${(repo.topics || []).join(' ')}`.toLowerCase();

  for (const [topic, keyword] of Object.entries(topicKeywords)) {
    if (text.includes(topic)) {
      return keyword;
    }
  }

  return 'technology';
}

function getUnsplashUrl(keyword, seed) {
  // Using source.unsplash.com with a seed for consistent images
  return `https://source.unsplash.com/800x400/?${keyword}&sig=${seed}`;
}

async function fetchForks() {
  const response = await fetch(
    `https://api.github.com/users/${GITHUB_USERNAME}/repos?type=forks&sort=updated&per_page=100`,
    {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'GitHub-Pages-Forks-Feed',
        ...(process.env.GITHUB_TOKEN && { 'Authorization': `token ${process.env.GITHUB_TOKEN}` })
      }
    }
  );

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return response.json();
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

async function main() {
  console.log('Fetching forked repositories...');

  const repos = await fetchForks();
  console.log(`Found ${repos.length} forked repos`);

  const forks = repos
    .slice(0, FORKS_TO_SHOW)
    .map((repo, index) => {
      const keyword = getImageKeyword(repo);
      return {
        name: repo.name,
        description: repo.description || 'No description available',
        url: repo.html_url,
        originalUrl: repo.fork ? `https://github.com/${repo.full_name.replace(GITHUB_USERNAME + '/', '')}` : repo.html_url,
        stars: repo.stargazers_count,
        language: repo.language,
        topics: repo.topics || [],
        forkedAt: formatDate(repo.created_at),
        updatedAt: formatDate(repo.updated_at),
        image: getUnsplashUrl(keyword, repo.id)
      };
    });

  const output = {
    lastUpdated: new Date().toISOString(),
    forks
  };

  fs.writeFileSync('forks.json', JSON.stringify(output, null, 2));
  console.log(`Generated forks.json with ${forks.length} repos`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
