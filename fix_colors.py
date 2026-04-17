import re
import os

# Files to process
files = [
    'app/(tabs)/alarms.tsx',
    'app/(tabs)/contacts.tsx',
    'app/(tabs)/anamnesis.tsx',
    'app/(tabs)/health.tsx',
    'app/(tabs)/settings.tsx',
    'app/(tabs)/ambulance.tsx',
    'app/(tabs)/location.tsx',
    'components/sidebar-menu.tsx',
    'components/alarm-card.tsx',
    'components/contact-card.tsx',
    'components/custom-tab-bar.tsx',
]

# Replacements: (pattern, replacement)
replacements = [
    # Primary color
    (r'color=\\"#0066CC\\"', 'color={colors.primary}'),
    (r"color='#0066CC'", "color={colors.primary}"),
    (r'backgroundColor: \'#0066CC\'', 'backgroundColor: colors.primary'),
    (r'backgroundColor: "#0066CC"', 'backgroundColor: colors.primary'),
    (r'color: \'#0066CC\'', 'color: colors.primary'),
    (r'color: "#0066CC"', 'color: colors.primary'),
    (r"trackColor=\{\{ false: colors.border, true: '#0066CC' \}\}", 'trackColor={{ false: colors.border, true: colors.primary }}'),
    (r"borderColor: '#0066CC'", 'borderColor: colors.primary'),
    (r'borderColor: "#0066CC"', 'borderColor: colors.primary'),
    (r"borderLeftColor: '#0066CC'", 'borderLeftColor: colors.primary'),
    (r"backgroundColor: '#0066CC15'", 'backgroundColor: colors.primaryLight'),
    (r"backgroundColor: '#0066CC10'", 'backgroundColor: colors.primaryLight'),
    (r"backgroundColor: '#0066CC20'", 'backgroundColor: colors.primaryLight'),
    
    # White text on colored backgrounds
    (r'color=\\"#FFFFFF\\"', 'color={colors.onPrimary}'),
    (r"color='#FFFFFF'", "color={colors.onPrimary}"),
    (r'thumbColor=\\"#FFFFFF\\"', 'thumbColor={colors.onPrimary}'),
    (r"thumbColor='#FFFFFF'", "thumbColor={colors.onPrimary}"),
    
    # Emergency/Red
    (r'backgroundColor: \'#FF0000\'', 'backgroundColor: colors.emergency'),
    (r'backgroundColor: "#FF0000"', 'backgroundColor: colors.emergency'),
    (r'color: \'#FF0000\'', 'color: colors.emergency'),
    (r'color: "#FF0000"', 'color: colors.emergency'),
    (r"backgroundColor: '#FF000010'", 'backgroundColor: colors.emergencyLight'),
    (r"backgroundColor: '#FF000015'", 'backgroundColor: colors.emergencyLight'),
    (r"borderColor: '#FF000030'", 'borderColor: colors.emergencyLight'),
    (r"color='#FF0000'", 'color={colors.emergency}'),
    (r'color="#FF0000"', 'color={colors.emergency}'),
    
    # Success/Green
    (r'color: \'#22C55E\'', 'color: colors.success'),
    (r'color: "#22C55E"', 'color: colors.success'),
    (r'backgroundColor: \'#22C55E\'', 'backgroundColor: colors.success'),
    (r'backgroundColor: "#22C55E"', 'backgroundColor: colors.success'),
    (r"trackColor=\{\{ false: colors.border, true: '#22C55E' \}\}", 'trackColor={{ false: colors.border, true: colors.success }}'),
    (r"backgroundColor: '#22C55E15'", 'backgroundColor: colors.successLight'),
    (r"color='#22C55E'", 'color={colors.success}'),
    
    # Error/Red
    (r'color: \'#EF4444\'', 'color: colors.error'),
    (r'color: "#EF4444"', 'color: colors.error'),
    (r"color='#EF4444'", 'color={colors.error}'),
    
    # Warning/Orange
    (r"backgroundColor: '#F59E0B15'", 'backgroundColor: colors.warningLight'),
    (r"backgroundColor: '#F59E0B10'", 'backgroundColor: colors.warningLight'),
    (r"borderColor: '#F59E0B40'", 'borderColor: colors.warning + \'40\''),
    (r"color: '#F59E0B'", 'color: colors.warning'),
    (r"color='#F59E0B'", 'color={colors.warning}'),
    (r"color: '#92400E'", 'color: colors.warningDark'),
    (r"color='#92400E'", 'color={colors.warningDark}'),
]

for file_path in files:
    full_path = os.path.join('/home/ubuntu/vigora-saude', file_path)
    if not os.path.exists(full_path):
        print(f"Skipping {file_path} - not found")
        continue
    
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    for pattern, replacement in replacements:
        content = re.sub(pattern, replacement, content)
    
    if content != original:
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed: {file_path}")
    else:
        print(f"No changes: {file_path}")

print("Done!")
