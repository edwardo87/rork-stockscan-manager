import { publicProcedure } from "@/backend/trpc/create-context";

export default publicProcedure.query(async () => {
  // Check required environment variables
  const requiredVars = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_SHEET_ID'
  ];

  const envStatus = requiredVars.reduce((acc, varName) => {
    acc[varName] = !!process.env[varName];
    return acc;
  }, {} as Record<string, boolean>);

  const allPresent = Object.values(envStatus).every(Boolean);

  // Log to server console for debugging
  console.log('Environment check:', {
    status: allPresent ? 'success' : 'error',
    variables: envStatus
  });

  return {
    success: allPresent,
    environmentVariables: envStatus,
    missingVariables: Object.entries(envStatus)
      .filter(([_, present]) => !present)
      .map(([name]) => name)
  };
});