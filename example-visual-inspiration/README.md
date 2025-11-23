# GitHub Models Arena

A Chrome browser extension for interacting with multiple AI models from the GitHub Models API with intelligent fallback and context-aware features.

## Overview

GitHub Models Arena provides free access to various AI models through GitHub's API, including GPT-4, Llama, Mistral, and others. The extension includes automatic model selection, rate limit tracking, and the ability to use content from multiple browser tabs as context.

## Features

### Multi-Tab Context
- Automatically loads content from all open tabs
- Select which tabs to include as context
- Compare and analyze information across multiple pages

### Intelligent Model Selection
- **Auto Mode**: Automatically selects the best available model based on rate limits and performance
- **Manual Mode**: Choose specific models to query simultaneously
- Automatic fallback when models hit rate limits

### Free Tier Access
- All models available with free rate-limited quotas
- Rate limits tracked per model
- Quotas reset automatically

### User Experience
- Clean, modern interface with light and dark themes
- Markdown rendering for formatted responses
- Interactive example prompts
- Real-time streaming responses

## Installation

### From Source

1. Clone this repository:
   ```bash
   git clone https://github.com/yourusername/github-models-arena.git
   cd github-models-arena
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right

4. Click "Load unpacked" and select the extension directory

### Prerequisites

You need a GitHub Personal Access Token with `user_models:read` permission.

1. Visit [GitHub Token Settings](https://github.com/settings/personal-access-tokens/new?description=GitHub+Models+API+token&name=GitHub+Models+Arena&user_models=read)
2. Set expiration to "No expiration"
3. Click "Generate token"
4. Copy the token and paste it in the extension settings

## Usage

### Basic Usage

1. Click the extension icon to open the side panel
2. Enter your GitHub token in Settings (first-time setup)
3. Ask questions about your open tabs or general topics
4. The AI will use content from all selected tabs as context

### Model Selection

**Auto Mode** (Default):
- Automatically picks the best available model
- Falls back to alternatives if rate limited
- Recommended for most users

**Manual Mode**:
- Click the model selector in the input area
- Choose specific models to query
- Responses appear simultaneously from all selected models

### Context Management

1. Click the "Context: X/Y tabs" indicator to expand
2. Uncheck tabs you want to exclude
3. The AI will only use content from checked tabs

## Available Models

The extension supports models from:
- OpenAI (GPT-4, GPT-4o, GPT-4o Mini)
- Meta (Llama 3.3, Llama 3.1)
- Mistral AI (Mistral Large, Mistral Small)
- Microsoft (Phi-4)
- DeepSeek (DeepSeek V3, DeepSeek R1)

Models are categorized by capability tier and automatically prioritized.

## Development

### Project Structure

```
github-models-arena/
├── manifest.json          # Extension manifest
├── sidepanel.html        # Main UI
├── sidepanel.js          # Application logic
├── background.js         # Service worker
├── marked.min.js         # Markdown parser
└── icon-*.png           # Extension icons
```

### Key Components

**State Management** (sidepanel.js):
- `STATE` object manages application state
- Tab context, model selection, and theme preferences

**UI Components**:
- Welcome card with example prompts
- Collapsible tabs list
- Model selection popup
- Settings panel

**API Integration**:
- Streaming responses from GitHub Models API
- Rate limit tracking and handling
- Automatic retry with fallback models

### Making Changes

1. Modify source files as needed
2. Reload the extension in `chrome://extensions/`
3. Test thoroughly with different models and contexts

## Configuration

### Storage

The extension stores:
- GitHub API token (local storage)
- Theme preference (local storage)
- Rate limit cache (local storage)

### Permissions

Required permissions:
- `activeTab`: Access current tab content
- `sidePanel`: Display side panel UI
- `scripting`: Inject scripts to read page content
- `storage`: Save settings and cache
- `cookies`: Session management
- `<all_urls>`: Access any webpage for context

## Rate Limits

Each model has different rate limits set by GitHub. When a model is rate limited:
- Auto mode automatically switches to an available model
- Manual mode displays an error for that specific model
- Limits reset automatically after a period

## Troubleshooting

### Token Issues
- Ensure your token has `user_models:read` permission
- Check that the token hasn't expired
- Verify the token in Settings

### Context Loading
- Some pages (chrome://, extension pages) cannot be accessed
- Restricted pages are automatically skipped
- Check the tabs list to see which tabs were loaded

### Model Errors
- Rate limits are common on free tier
- Try Auto mode for automatic fallback
- Wait a few minutes for quotas to reset

## Privacy

- All API calls go directly to GitHub Models API
- No data is collected or stored externally
- API token is stored locally in your browser
- Tab content is only sent when you submit a query

## Contributing

Contributions are welcome. Please:
- Follow existing code style
- Test thoroughly before submitting
- Document new features in the README
- Keep changes focused and atomic

## License

MIT License - see LICENSE file for details

## Links

- [GitHub Models Marketplace](https://github.com/marketplace/models)
- [GitHub Models Documentation](https://docs.github.com/en/github-models)
- [Chrome Extension Documentation](https://developer.chrome.com/docs/extensions/)

## Version

Current version: 1.0

## Support

For issues, questions, or suggestions, please open an issue on GitHub.
