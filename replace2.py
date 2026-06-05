import sys

with open('src/app/components/views/ui/VendasTable.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# 1. Remove `if (platform === "Geral") {`
# We search for it
start_if = -1
for i, line in enumerate(lines):
    if 'if (platform === "Geral") {' in line:
        start_if = i
        break

if start_if != -1:
    del lines[start_if]

# 2. Find the closing brace of the if block and the default renderer
end_premium_return = -1
for i in range(start_if, len(lines)):
    if '/* Renderizador padrão para outras plataformas */' in lines[i]:
        # We want to start deleting from the line before it (which is `}`) or two lines before (which is `              }`)
        end_premium_return = i - 2
        break

if end_premium_return != -1:
    # Find where the default renderer map ends
    # It ends right before `            })}`
    end_map = -1
    for i in range(end_premium_return, len(lines)):
        if '            })}' in lines[i]:
            end_map = i
            break
    
    if end_map != -1:
        # delete from end_premium_return to end_map (exclusive)
        del lines[end_premium_return:end_map]

with open('src/app/components/views/ui/VendasTable.tsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)
