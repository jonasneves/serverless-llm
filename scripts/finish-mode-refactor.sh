#!/usr/bin/env bash
# Complete the mode refactor: council/roundtable/personality → analyze/debate

set -e

echo "Completing frontend mode refactor..."

# Update useSessionController.ts imports
sed -i '' 's/fetchCouncilStream, fetchDiscussionStream, fetchPersonalityStream/fetchAnalyzeStream, fetchDebateStream/g' app/chat/frontend/src/hooks/useSessionController.ts

# Remove Council types and props (these need manual verification)
echo "⚠️  Manual step required: Remove CouncilRanking, CouncilReview types from useSessionController.ts"
echo "⚠️  Manual step required: Remove setCouncilAggregateRankings, setCouncilAnonymousReviews from SessionControllerParams"

# Update mode-specific files with simple replacements
for file in \
  app/chat/frontend/src/components/Header.tsx \
  app/chat/frontend/src/components/SettingsModal.tsx \
  app/chat/frontend/src/components/DiscussionTranscript.tsx \
  app/chat/frontend/src/components/arenas/ArenaCanvas.tsx \
  app/chat/frontend/src/hooks/useModelsManager.ts \
  app/chat/frontend/src/hooks/useConversationHistory.ts
do
  if [ -f "$file" ]; then
    echo "Updating $file..."
    # Replace mode checks
    sed -i '' "s/'council'/'analyze'/g" "$file"
    sed -i '' "s/'roundtable'/'debate'/g" "$file"
    sed -i '' "s/'personality'/'analyze'/g" "$file" # Map personality to analyze for now
    # Update comments
    sed -i '' 's/Council/Analyze/g' "$file"
    sed -i '' 's/Roundtable/Debate/g' "$file"
    sed -i '' 's/Personality/Analyze/g' "$file"
  fi
done

echo "✓ Automated updates complete"
echo ""
echo "Remaining manual steps:"
echo "1. Update useSessionController.ts switch statement (mode === 'council' → 'analyze', etc.)"
echo "2. Replace fetchCouncilStream → fetchAnalyzeStream calls"
echo "3. Replace fetchDiscussionStream → fetchDebateStream calls"
echo "4. Remove fetchPersonalityStream calls"
echo "5. Remove council-specific state management logic"
echo "6. Test in browser: npm run dev"
