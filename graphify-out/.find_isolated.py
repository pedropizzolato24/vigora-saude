
import json, sys
import networkx as nx
from networkx.readwrite import json_graph
from pathlib import Path
from collections import defaultdict

data = json.loads(Path('graphify-out/graph.json').read_text(encoding="utf-8"))
G = json_graph.node_link_graph(data, edges='links')

print(f"Graph stats: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges")
print(f"Is directed: {G.is_directed()}")

# Convert to undirected for connectivity analysis
if G.is_directed():
    G_un = G.to_undirected()
else:
    G_un = G

# Find connected components
components = list(nx.connected_components(G_un))
components_by_size = sorted(components, key=len)

print(f"\nTotal connected components: {len(components)}")
print(f"Largest component size: {len(components[-1])}")
if len(components) > 1:
    print(f"Second largest: {len(components[-2])}")

# Find truly isolated nodes (degree 0)
isolated_nodes = list(nx.isolates(G_un))
print(f"\nTotally isolated nodes (degree 0): {len(isolated_nodes)}")

# Size distribution of non-main components
non_main = [c for c in components if len(c) < len(components[-1])]
size_dist = defaultdict(int)
for c in non_main:
    size_dist[len(c)] += 1

print(f"\nSize distribution of isolated components (not main):")
for sz in sorted(size_dist.keys()):
    print(f"  size {sz}: {size_dist[sz]} components")

# Details on each isolated group (non-main components)
print(f"\n\n=== ISOLATED COMPONENTS DETAILS ===")
for i, comp in enumerate(sorted(non_main, key=len, reverse=True)):
    nodes_info = []
    for nid in comp:
        d = G_un.nodes[nid]
        nodes_info.append({
            'id': nid,
            'label': d.get('label', '?'),
            'type': d.get('file_type', '?'),
            'source': d.get('source_file', '?'),
            'degree': G_un.degree(nid)
        })
    edges_in_comp = []
    subg = G_un.subgraph(comp)
    for u, v, d in subg.edges(data=True):
        edges_in_comp.append({
            'from': G_un.nodes[u].get('label','?'),
            'to': G_un.nodes[v].get('label','?'),
            'relation': d.get('relation','?')
        })
    print(f"\nCOMPONENT {i+1} (size={len(comp)}):")
    print(f"  Nodes:")
    for n in nodes_info:
        print(f"    - [{n['label']}] type={n['type']} deg={n['degree']} src={n['source']}")
    if edges_in_comp:
        print(f"  Internal Edges:")
        for e in edges_in_comp[:5]:
            print(f"    {e['from']} --{e['relation']}--> {e['to']}")

# Save to JSON for subagent use
output = {
    'total_nodes': G.number_of_nodes(),
    'total_edges': G.number_of_edges(),
    'total_components': len(components),
    'main_component_size': len(components[-1]),
    'isolated_nodes_count': len(isolated_nodes),
    'isolated_components': []
}

for comp in sorted(non_main, key=len, reverse=True):
    nodes_info = []
    for nid in comp:
        d = G_un.nodes[nid]
        nodes_info.append({
            'id': nid,
            'label': d.get('label', '?'),
            'type': d.get('file_type', '?'),
            'source': d.get('source_file', '?'),
            'degree': G_un.degree(nid),
            'neighbors': [G_un.nodes[nb].get('label','?') for nb in G_un.neighbors(nid)]
        })
    edges_in_comp = []
    subg = G_un.subgraph(comp)
    for u, v, d in subg.edges(data=True):
        edges_in_comp.append({
            'from': G_un.nodes[u].get('label','?'),
            'to': G_un.nodes[v].get('label','?'),
            'relation': d.get('relation','?'),
            'confidence': d.get('confidence','?')
        })
    output['isolated_components'].append({
        'size': len(comp),
        'nodes': nodes_info,
        'internal_edges': edges_in_comp
    })

Path('graphify-out/.graphify_isolated.json').write_text(json.dumps(output, indent=2, ensure_ascii=False), encoding='utf-8')
print(f"\n\nSaved isolated analysis to graphify-out/.graphify_isolated.json")
print(f"Total isolated components (non-main): {len(non_main)}")
