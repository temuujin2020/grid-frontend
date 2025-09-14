// Script to process actual logo files and update team data
const fs = require('fs');
const path = require('path');

// Function to convert filename to proper team name
function filenameToTeamName(filename) {
  // Remove .png extension
  const name = filename.replace('.png', '');
  
  // Handle spaces and special characters in filenames
  const normalizedName = name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  
  // Convert to proper case and handle special cases
  const teamNames = {
    '1win': '1WIN',
    'ago': 'AGO', 
    'astralis': 'Astralis',
    'bestia': 'Bestia',
    'cloud9': 'Cloud9',
    'faze clan': 'FaZe Clan',
    'faze': 'FaZe Clan',
    'fluxo': 'Fluxo',
    'fnatic': 'Fnatic',
    'g2 esports': 'G2 Esports',
    'g2': 'G2 Esports',
    'team liquid': 'Team Liquid',
    'liquid': 'Team Liquid',
    'navi': 'NAVI',
    'ninjas in pyjamas': 'Ninjas in Pyjamas',
    'nip': 'Ninjas in Pyjamas',
    'players': 'Players',
    'red reserve': 'Red Reserve',
    'red-reserve': 'Red Reserve',
    'sprout': 'Sprout',
    'team vitality': 'Team Vitality',
    'vitality': 'Team Vitality',
    'windigo': 'Windigo',
    'x6tence': 'x6tence',
    'y5': 'Y5',
    // Add more common team name variations
    'mouz': 'MOUZ',
    'heroic': 'HEROIC',
    'big': 'BIG',
    'vitality': 'Team Vitality',
    'spirit': 'Team Spirit',
    'eternal fire': 'Eternal Fire',
    'eternalfire': 'Eternal Fire',
    'eternal-fire': 'Eternal Fire',
    'forze': 'FORZE',
    'gamerlegion': 'GamerLegion',
    'gamer legion': 'GamerLegion',
    'gamer-legion': 'GamerLegion',
    'monte': 'Monte',
    'natus vincere': 'NAVI',
    'natus-vincere': 'NAVI',
    'team spirit': 'Team Spirit',
    'team-spirit': 'Team Spirit',
    'vitality': 'Team Vitality',
    'team-vitality': 'Team Vitality'
  };
  
  return teamNames[normalizedName] || name;
}

// Function to generate team colors based on common esports team colors
function getTeamColors(teamName) {
  const colorMap = {
    '1WIN': { primary: '#ff0000', secondary: '#ffffff' },
    'AGO': { primary: '#dc267f', secondary: '#726180' },
    'Astralis': { primary: '#ff0000', secondary: '#ffffff' },
    'Bestia': { primary: '#8b5cf6', secondary: '#ffffff' },
    'BIG': { primary: '#000000', secondary: '#ffffff' },
    'Cloud9': { primary: '#0066cc', secondary: '#ffffff' },
    'Eternal Fire': { primary: '#ff6b35', secondary: '#ffffff' },
    'FaZe Clan': { primary: '#000000', secondary: '#ffffff' },
    'Fluxo': { primary: '#00d4aa', secondary: '#ffffff' },
    'Fnatic': { primary: '#ff6600', secondary: '#000000' },
    'FORZE': { primary: '#ff0000', secondary: '#ffffff' },
    'GamerLegion': { primary: '#8b5cf6', secondary: '#ffffff' },
    'G2 Esports': { primary: '#000000', secondary: '#ffffff' },
    'HEROIC': { primary: '#ffd700', secondary: '#000000' },
    'MOUZ': { primary: '#000000', secondary: '#ffffff' },
    'Monte': { primary: '#3b82f6', secondary: '#ffffff' },
    'Team Liquid': { primary: '#0066cc', secondary: '#ffffff' },
    'NAVI': { primary: '#ffd700', secondary: '#000000' },
    'Ninjas in Pyjamas': { primary: '#000000', secondary: '#ffffff' },
    'Players': { primary: '#3b82f6', secondary: '#ffffff' },
    'Red Reserve': { primary: '#da1e28', secondary: '#cc666b' },
    'Sprout': { primary: '#34bc6e', secondary: '#726180' },
    'Team Spirit': { primary: '#ff6b35', secondary: '#ffffff' },
    'Team Vitality': { primary: '#ffd700', secondary: '#000000' },
    'Windigo': { primary: '#7732bb', secondary: '#5e6868' },
    'x6tence': { primary: '#c22dd5', secondary: '#473793' },
    'Y5': { primary: '#f59e0b', secondary: '#000000' }
  };
  
  return colorMap[teamName] || { primary: '#3b82f6', secondary: '#ffffff' };
}

// Process logos directory
function processLogos() {
  const logosDir = './logos';
  const teamData = {};
  
  if (!fs.existsSync(logosDir)) {
    console.log('❌ Logos directory not found');
    return;
  }
  
  const files = fs.readdirSync(logosDir);
  const logoFiles = files.filter(file => file.endsWith('.png'));
  
  console.log(`📁 Found ${logoFiles.length} logo files:`);
  
  logoFiles.forEach(filename => {
    const teamName = filenameToTeamName(filename);
    const colors = getTeamColors(teamName);
    const normalizedKey = teamName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    teamData[normalizedKey] = {
      name: teamName,
      logoUrl: `./logos/${filename}`,
      colorPrimary: colors.primary,
      colorSecondary: colors.secondary,
      source: 'local'
    };
    
    console.log(`  ✅ ${filename} → ${teamName}`);
  });
  
  return teamData;
}

// Update React app with processed team data
function updateReactApp(teamData) {
  const appPath = './src/App.js';
  
  if (fs.existsSync(appPath)) {
    let content = fs.readFileSync(appPath, 'utf8');
    
    // Replace the knownTeams object
    const startMarker = 'const knownTeams = {';
    const endMarker = '};';
    
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker, startIndex) + endMarker.length;
    
    if (startIndex !== -1 && endIndex !== -1) {
      const newTeamData = 'const knownTeams = ' + JSON.stringify(teamData, null, 2) + ';';
      content = content.substring(0, startIndex) + newTeamData + content.substring(endIndex);
      
      fs.writeFileSync(appPath, content);
      console.log('✅ Updated React app with processed team data');
    }
  }
}

// Generate team data code for easy copying
function generateTeamDataCode(teamData) {
  let code = '// Processed team data from logo files\n';
  code += 'const knownTeams = {\n';
  
  Object.entries(teamData).forEach(([key, team]) => {
    code += `  '${key}': {\n`;
    code += `    name: '${team.name}',\n`;
    code += `    logoUrl: '${team.logoUrl}',\n`;
    code += `    colorPrimary: '${team.colorPrimary}',\n`;
    code += `    colorSecondary: '${team.colorSecondary}',\n`;
    code += `    source: 'local'\n`;
    code += `  },\n`;
  });
  
  code += '};\n';
  return code;
}

// Main execution
console.log('🚀 Processing logo files...');
const teamData = processLogos();

if (Object.keys(teamData).length > 0) {
  console.log(`\n📊 Processed ${Object.keys(teamData).length} teams:`);
  Object.values(teamData).forEach(team => {
    console.log(`  • ${team.name} (${team.logoUrl})`);
  });
  
  updateReactApp(teamData);
  
  console.log('\n📝 Generated team data code:');
  console.log('=' .repeat(50));
  console.log(generateTeamDataCode(teamData));
  console.log('=' .repeat(50));
  
  console.log('\n✅ Logo processing complete!');
  console.log('🎯 Your React app now uses the actual logo filenames');
} else {
  console.log('❌ No logo files found to process');
}
