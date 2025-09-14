// Script to add new team logos easily
const fs = require('fs');
const path = require('path');

// Function to add a new team logo
function addTeamLogo(filename, teamName, colorPrimary = '#3b82f6', colorSecondary = '#ffffff') {
  const logosDir = './logos';
  
  // Ensure logos directory exists
  if (!fs.existsSync(logosDir)) {
    fs.mkdirSync(logosDir, { recursive: true });
  }
  
  // Create placeholder file
  const filePath = path.join(logosDir, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `<!-- Placeholder for ${teamName} logo -->`);
    console.log(`📁 Created placeholder: ${filename}`);
  }
  
  // Generate normalized key
  const normalizedKey = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  // Return team data object
  return {
    [normalizedKey]: {
      name: teamName,
      logoUrl: `./logos/${filename}`,
      colorPrimary: colorPrimary,
      colorSecondary: colorSecondary,
      source: 'local'
    }
  };
}

// Example usage
console.log('🎯 Logo Addition Helper');
console.log('Usage: node add-logo.js "filename.png" "Team Name" "#color1" "#color2"');
console.log('');

// Process command line arguments
const args = process.argv.slice(2);
if (args.length >= 2) {
  const filename = args[0];
  const teamName = args[1];
  const colorPrimary = args[2] || '#3b82f6';
  const colorSecondary = args[3] || '#ffffff';
  
  const teamData = addTeamLogo(filename, teamName, colorPrimary, colorSecondary);
  
  console.log('✅ Team data generated:');
  console.log(JSON.stringify(teamData, null, 2));
  
  console.log('\n📝 Add this to your knownTeams object:');
  const key = Object.keys(teamData)[0];
  const team = teamData[key];
  console.log(`'${key}': {`);
  console.log(`  name: '${team.name}',`);
  console.log(`  logoUrl: '${team.logoUrl}',`);
  console.log(`  colorPrimary: '${team.colorPrimary}',`);
  console.log(`  colorSecondary: '${team.colorSecondary}',`);
  console.log(`  source: 'local'`);
  console.log(`},`);
} else {
  console.log('❌ Please provide filename and team name');
  console.log('Example: node add-logo.js "mouz.png" "MOUZ" "#000000" "#ffffff"');
}
