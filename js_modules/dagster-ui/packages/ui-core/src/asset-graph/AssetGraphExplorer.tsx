import {
  Checkbox,
  Colors,
  NonIdealState,
  SplitPanelContainer,
  ErrorBoundary,
  Button,
  Icon,
  Tooltip,
  TextInputContainer,
  Box,
} from '@dagster-io/ui-components';
import pickBy from 'lodash/pickBy';
import uniq from 'lodash/uniq';
import without from 'lodash/without';
import React from 'react';
import styled from 'styled-components';

import {useFeatureFlags} from '../app/Flags';
import {AssetLiveDataRefresh} from '../asset-data/AssetLiveDataProvider';
import {LaunchAssetExecutionButton} from '../assets/LaunchAssetExecutionButton';
import {LaunchAssetObservationButton} from '../assets/LaunchAssetObservationButton';
import {AssetKey} from '../assets/types';
import {DEFAULT_MAX_ZOOM, SVGViewport} from '../graph/SVGViewport';
import {useAssetLayout} from '../graph/asyncGraphLayout';
import {closestNodeInDirection, isNodeOffscreen} from '../graph/common';
import {
  GraphExplorerOptions,
  OptionsOverlay,
  RightInfoPanel,
  RightInfoPanelContent,
} from '../pipelines/GraphExplorer';
import {
  EmptyDAGNotice,
  EntirelyFilteredDAGNotice,
  LargeDAGNotice,
  LoadingNotice,
} from '../pipelines/GraphNotices';
import {ExplorerPath} from '../pipelines/PipelinePathUtils';
import {GraphQueryInput} from '../ui/GraphQueryInput';
import {Loading, LoadingSpinner} from '../ui/Loading';

import {AssetEdges} from './AssetEdges';
import {AssetGraphJobSidebar} from './AssetGraphJobSidebar';
import {AssetGroupNode} from './AssetGroupNode';
import {AssetNode, AssetNodeMinimal} from './AssetNode';
import {AssetNodeLink} from './ForeignNode';
import {SidebarAssetInfo} from './SidebarAssetInfo';
import {GraphData, graphHasCycles, GraphNode, tokenForAssetKey} from './Utils';
import {AssetGraphLayout, AssetLayoutEdge} from './layout';
import {AssetGraphExplorerSidebar} from './sidebar/Sidebar';
import {AssetNodeForGraphQueryFragment} from './types/useAssetGraphData.types';
import {AssetGraphFetchScope, AssetGraphQueryItem, useAssetGraphData} from './useAssetGraphData';
import {AssetLocation, useFindAssetLocation} from './useFindAssetLocation';

type AssetNode = AssetNodeForGraphQueryFragment;

interface Props {
  options: GraphExplorerOptions;
  setOptions?: (options: GraphExplorerOptions) => void;

  fetchOptions: AssetGraphFetchScope;
  fetchOptionFilters?: React.ReactNode;

  explorerPath: ExplorerPath;
  onChangeExplorerPath: (path: ExplorerPath, mode: 'replace' | 'push') => void;
  onNavigateToSourceAssetNode: (node: AssetLocation) => void;
}

export const MINIMAL_SCALE = 0.6;
export const GROUPS_ONLY_SCALE = 0.15;

export const AssetGraphExplorer = (props: Props) => {
  const {
    fetchResult,
    assetGraphData,
    fullAssetGraphData,
    graphQueryItems,
    allAssetKeys,
    applyingEmptyDefault,
    isCalculating,
  } = useAssetGraphData(props.explorerPath.opsQuery, props.fetchOptions);

  if (isCalculating) {
    return <LoadingSpinner purpose="page" />;
  }

  return (
    <Loading allowStaleData queryResult={fetchResult}>
      {() => {
        if (!assetGraphData || !allAssetKeys || !fullAssetGraphData) {
          return <NonIdealState icon="error" title="Query Error" />;
        }

        const hasCycles = graphHasCycles(assetGraphData);

        if (hasCycles) {
          return (
            <NonIdealState
              icon="error"
              title="Cycle detected"
              description="Assets dependencies form a cycle"
            />
          );
        }
        return (
          <AssetGraphExplorerWithData
            key={props.explorerPath.pipelineName}
            assetGraphData={assetGraphData}
            fullAssetGraphData={fullAssetGraphData}
            allAssetKeys={allAssetKeys}
            graphQueryItems={graphQueryItems}
            applyingEmptyDefault={applyingEmptyDefault}
            {...props}
          />
        );
      }}
    </Loading>
  );
};

interface WithDataProps extends Props {
  allAssetKeys: AssetKey[];
  assetGraphData: GraphData;
  fullAssetGraphData: GraphData;
  graphQueryItems: AssetGraphQueryItem[];
  applyingEmptyDefault: boolean;
}

const AssetGraphExplorerWithData = ({
  options,
  setOptions,
  explorerPath,
  onChangeExplorerPath,
  onNavigateToSourceAssetNode: onNavigateToSourceAssetNode,
  assetGraphData,
  fullAssetGraphData,
  graphQueryItems,
  applyingEmptyDefault,
  fetchOptions,
  fetchOptionFilters,
  allAssetKeys,
}: WithDataProps) => {
  const findAssetLocation = useFindAssetLocation();
  const {layout, loading, async} = useAssetLayout(assetGraphData);
  const viewportEl = React.useRef<SVGViewport>();
  const {flagHorizontalDAGs, flagDAGSidebar} = useFeatureFlags();

  const [highlighted, setHighlighted] = React.useState<string | null>(null);

  const selectedAssetValues = explorerPath.opNames[explorerPath.opNames.length - 1]!.split(',');
  const selectedGraphNodes = Object.values(assetGraphData.nodes).filter((node) =>
    selectedAssetValues.includes(tokenForAssetKey(node.definition.assetKey)),
  );
  const lastSelectedNode = selectedGraphNodes[selectedGraphNodes.length - 1]!;

  const selectedDefinitions = selectedGraphNodes.map((a) => a.definition);
  const allDefinitionsForMaterialize = applyingEmptyDefault
    ? graphQueryItems.map((a) => a.node)
    : Object.values(assetGraphData.nodes).map((a) => a.definition);

  const onSelectNode = React.useCallback(
    async (
      e: React.MouseEvent<any> | React.KeyboardEvent<any>,
      assetKey: {path: string[]},
      node: GraphNode | null,
    ) => {
      e.stopPropagation();

      const token = tokenForAssetKey(assetKey);
      const nodeIsInDisplayedGraph = node?.definition;

      if (!nodeIsInDisplayedGraph) {
        // The asset's definition was not provided in our query for job.assetNodes. It's either
        // in another job or asset group, or is a source asset not defined in any repository.
        return onNavigateToSourceAssetNode(await findAssetLocation(assetKey));
      }

      // This asset is in a job and we can stay in the job graph explorer!
      // If it's in our current job, allow shift / meta multi-selection.
      let nextOpsNameSelection = token;

      if (e.shiftKey || e.metaKey) {
        // Meta key adds the node you clicked to your existing selection
        let tokensToAdd = [token];

        // Shift key adds the nodes between the node you clicked and your existing selection.
        // To better support clicking a bunch of leaves and extending selection, we try to reach
        // the new node from each node in your current selection until we find a path.
        if (e.shiftKey && selectedGraphNodes.length && node) {
          const reversed = [...selectedGraphNodes].reverse();
          for (const from of reversed) {
            const tokensInRange = assetKeyTokensInRange({from, to: node, graph: assetGraphData});
            if (tokensInRange.length) {
              tokensToAdd = tokensInRange;
              break;
            }
          }
        }

        const existing = explorerPath.opNames[0]!.split(',');
        nextOpsNameSelection = (
          existing.includes(token) ? without(existing, token) : uniq([...existing, ...tokensToAdd])
        ).join(',');
      }

      const nextCenter = layout?.nodes[nextOpsNameSelection[nextOpsNameSelection.length - 1]!];
      if (nextCenter) {
        viewportEl.current?.zoomToSVGCoords(nextCenter.bounds.x, nextCenter.bounds.y, true);
      }

      onChangeExplorerPath(
        {
          ...explorerPath,
          opNames: [nextOpsNameSelection],
          opsQuery: nodeIsInDisplayedGraph
            ? explorerPath.opsQuery
            : `${explorerPath.opsQuery},++"${token}"++`,
          pipelineName: explorerPath.pipelineName,
        },
        'replace',
      );
    },
    [
      explorerPath,
      onChangeExplorerPath,
      onNavigateToSourceAssetNode,
      findAssetLocation,
      selectedGraphNodes,
      assetGraphData,
      layout,
    ],
  );

  const [lastRenderedLayout, setLastRenderedLayout] = React.useState<AssetGraphLayout | null>(null);
  const renderingNewLayout = lastRenderedLayout !== layout;

  React.useEffect(() => {
    if (!renderingNewLayout || !layout || !viewportEl.current) {
      return;
    }
    // The first render where we have our layout and viewport, autocenter or
    // focus on the selected node. (If selection was specified in the URL).
    // Don't animate this change.
    if (lastSelectedNode) {
      const layoutNode = layout.nodes[lastSelectedNode.id];
      if (layoutNode) {
        viewportEl.current.zoomToSVGBox(layoutNode.bounds, false);
      }
      viewportEl.current.focus();
    } else {
      viewportEl.current.autocenter(false);
    }
    setLastRenderedLayout(layout);
  }, [renderingNewLayout, lastSelectedNode, layout, viewportEl]);

  const onClickBackground = () =>
    onChangeExplorerPath(
      {...explorerPath, pipelineName: explorerPath.pipelineName, opNames: []},
      'replace',
    );

  const onArrowKeyDown = (e: React.KeyboardEvent<any>, dir: string) => {
    if (!layout || !lastSelectedNode) {
      return;
    }
    const hasDefinition = (node: {id: string}) => !!assetGraphData.nodes[node.id]?.definition;
    const layoutWithoutExternalLinks = {...layout, nodes: pickBy(layout.nodes, hasDefinition)};

    const nextId = closestNodeInDirection(layoutWithoutExternalLinks, lastSelectedNode.id, dir);
    selectNodeById(e, nextId);
  };

  const selectNodeById = React.useCallback(
    (e: React.MouseEvent<any> | React.KeyboardEvent<any>, nodeId?: string) => {
      if (!nodeId) {
        return;
      }
      const node = assetGraphData.nodes[nodeId];
      if (node) {
        onSelectNode(e, node.assetKey, node);
        if (layout && viewportEl.current) {
          viewportEl.current.zoomToSVGBox(layout.nodes[nodeId]!.bounds, true);
        }
      }
    },
    [assetGraphData.nodes, layout, onSelectNode],
  );

  const allowGroupsOnlyZoomLevel = !!(layout && Object.keys(layout.groups).length);

  const [showSidebar, setShowSidebar] = React.useState(true);

  const explorer = (
    <SplitPanelContainer
      key="explorer"
      identifier="asset-graph-explorer"
      firstInitialPercent={70}
      firstMinSize={400}
      first={
        <ErrorBoundary region="graph">
          {graphQueryItems.length === 0 ? (
            <EmptyDAGNotice nodeType="asset" isGraph />
          ) : applyingEmptyDefault ? (
            <LargeDAGNotice nodeType="asset" anchorLeft="40px" />
          ) : Object.keys(assetGraphData.nodes).length === 0 ? (
            <EntirelyFilteredDAGNotice nodeType="asset" />
          ) : undefined}
          {loading || !layout ? (
            <LoadingNotice async={async} nodeType="asset" />
          ) : (
            <SVGViewport
              ref={(r) => (viewportEl.current = r || undefined)}
              defaultZoom={flagHorizontalDAGs ? 'zoom-to-fit-width' : 'zoom-to-fit'}
              interactor={SVGViewport.Interactors.PanAndZoom}
              graphWidth={layout.width}
              graphHeight={layout.height}
              graphHasNoMinimumZoom={allowGroupsOnlyZoomLevel}
              onClick={onClickBackground}
              onArrowKeyDown={onArrowKeyDown}
              onDoubleClick={(e) => {
                viewportEl.current?.autocenter(true);
                e.stopPropagation();
              }}
              maxZoom={DEFAULT_MAX_ZOOM}
              maxAutocenterZoom={1.0}
            >
              {({scale}, viewportRect) => (
                <SVGContainer width={layout.width} height={layout.height}>
                  <AssetEdges
                    viewportRect={viewportRect}
                    selected={selectedGraphNodes.map((n) => n.id)}
                    highlighted={highlighted}
                    edges={filterEdges(
                      layout.edges,
                      allowGroupsOnlyZoomLevel,
                      scale,
                      assetGraphData,
                    )}
                    strokeWidth={allowGroupsOnlyZoomLevel ? Math.max(4, 3 / scale) : 4}
                    baseColor={
                      allowGroupsOnlyZoomLevel && scale < GROUPS_ONLY_SCALE
                        ? Colors.Gray400
                        : Colors.KeylineGray
                    }
                  />

                  {Object.values(layout.groups)
                    .filter((node) => !isNodeOffscreen(node.bounds, viewportRect))
                    .sort((a, b) => a.id.length - b.id.length)
                    .map((group) => (
                      <foreignObject
                        key={group.id}
                        {...group.bounds}
                        onDoubleClick={(e) => {
                          if (!viewportEl.current) {
                            return;
                          }
                          const targetScale = viewportEl.current.scaleForSVGBounds(
                            group.bounds.width,
                            group.bounds.height,
                          );
                          viewportEl.current.zoomToSVGBox(group.bounds, true, targetScale * 0.9);
                          e.stopPropagation();
                        }}
                      >
                        <AssetGroupNode group={group} scale={scale} />
                      </foreignObject>
                    ))}

                  {Object.values(layout.nodes)
                    .filter((node) => !isNodeOffscreen(node.bounds, viewportRect))
                    .map(({id, bounds}) => {
                      const graphNode = assetGraphData.nodes[id]!;
                      const path = JSON.parse(id);
                      if (allowGroupsOnlyZoomLevel && scale < GROUPS_ONLY_SCALE) {
                        return;
                      }
                      return (
                        <foreignObject
                          {...bounds}
                          key={id}
                          onMouseEnter={() => setHighlighted(id)}
                          onMouseLeave={() => setHighlighted(null)}
                          onClick={(e) => onSelectNode(e, {path}, graphNode)}
                          onDoubleClick={(e) => {
                            viewportEl.current?.zoomToSVGBox(bounds, true, 1.2);
                            e.stopPropagation();
                          }}
                          style={{overflow: 'visible'}}
                        >
                          {!graphNode ? (
                            <AssetNodeLink assetKey={{path}} />
                          ) : scale < MINIMAL_SCALE ? (
                            <AssetNodeMinimal
                              definition={graphNode.definition}
                              selected={selectedGraphNodes.includes(graphNode)}
                            />
                          ) : (
                            <AssetNode
                              definition={graphNode.definition}
                              selected={selectedGraphNodes.includes(graphNode)}
                            />
                          )}
                        </foreignObject>
                      );
                    })}
                </SVGContainer>
              )}
            </SVGViewport>
          )}
          {setOptions && (
            <OptionsOverlay>
              <Checkbox
                format="switch"
                label="View as Asset Graph"
                checked={options.preferAssetRendering}
                onChange={() => {
                  onChangeExplorerPath(
                    {...explorerPath, opNames: selectedDefinitions[0]?.opNames || []},
                    'replace',
                  );
                  setOptions({
                    ...options,
                    preferAssetRendering: !options.preferAssetRendering,
                  });
                }}
              />
            </OptionsOverlay>
          )}

          <TopbarWrapper style={{paddingLeft: showSidebar || !flagDAGSidebar ? 12 : 24}}>
            {showSidebar || !flagDAGSidebar ? undefined : (
              <Tooltip content="Show sidebar">
                <Button
                  icon={<Icon name="panel_show_left" />}
                  onClick={() => {
                    setShowSidebar(true);
                  }}
                />
              </Tooltip>
            )}
            <div>{fetchOptionFilters}</div>
            <GraphQueryInputFlexWrap>
              <GraphQueryInput
                type="asset_graph"
                items={graphQueryItems}
                value={explorerPath.opsQuery}
                placeholder="Type an asset subset…"
                onChange={(opsQuery) =>
                  onChangeExplorerPath({...explorerPath, opsQuery}, 'replace')
                }
                popoverPosition="bottom-left"
              />
            </GraphQueryInputFlexWrap>
            <Button
              onClick={() => {
                onChangeExplorerPath({...explorerPath, opsQuery: ''}, 'push');
              }}
            >
              Clear query
            </Button>
            <AssetLiveDataRefresh />
            <LaunchAssetObservationButton
              preferredJobName={explorerPath.pipelineName}
              scope={
                selectedDefinitions.length
                  ? {selected: selectedDefinitions.filter((a) => a.isObservable)}
                  : {all: allDefinitionsForMaterialize.filter((a) => a.isObservable)}
              }
            />
            <LaunchAssetExecutionButton
              preferredJobName={explorerPath.pipelineName}
              scope={
                selectedDefinitions.length
                  ? {selected: selectedDefinitions}
                  : {all: allDefinitionsForMaterialize}
              }
            />
          </TopbarWrapper>
        </ErrorBoundary>
      }
      second={
        selectedGraphNodes.length === 1 && selectedGraphNodes[0] ? (
          <RightInfoPanel>
            <RightInfoPanelContent>
              <ErrorBoundary region="asset sidebar" resetErrorOnChange={[selectedGraphNodes[0].id]}>
                <SidebarAssetInfo graphNode={selectedGraphNodes[0]} />
              </ErrorBoundary>
            </RightInfoPanelContent>
          </RightInfoPanel>
        ) : fetchOptions.pipelineSelector ? (
          <RightInfoPanel>
            <RightInfoPanelContent>
              <ErrorBoundary region="asset job sidebar">
                <AssetGraphJobSidebar pipelineSelector={fetchOptions.pipelineSelector} />
              </ErrorBoundary>
            </RightInfoPanelContent>
          </RightInfoPanel>
        ) : null
      }
    />
  );

  if (showSidebar && flagDAGSidebar) {
    return (
      <SplitPanelContainer
        key="explorer-wrapper"
        identifier="explorer-wrapper"
        firstMinSize={300}
        firstInitialPercent={0}
        first={
          showSidebar ? (
            <AssetGraphExplorerSidebar
              allAssetKeys={allAssetKeys}
              assetGraphData={assetGraphData}
              fullAssetGraphData={fullAssetGraphData}
              lastSelectedNode={lastSelectedNode}
              selectNode={selectNodeById}
              explorerPath={explorerPath}
              onChangeExplorerPath={onChangeExplorerPath}
              hideSidebar={() => {
                setShowSidebar(false);
              }}
            />
          ) : null
        }
        second={explorer}
      />
    );
  }
  return explorer;
};

const SVGContainer = styled.svg`
  overflow: visible;
  border-radius: 0;
`;

// Helpers

const graphDirectionOf = ({
  graph,
  from,
  to,
}: {
  graph: GraphData;
  from: GraphNode;
  to: GraphNode;
}) => {
  const stack = [from];
  while (stack.length) {
    const node = stack.pop()!;

    const downstream = [...Object.keys(graph.downstream[node.id] || {})]
      .map((n) => graph.nodes[n]!)
      .filter(Boolean);
    if (downstream.some((d) => d.id === to.id)) {
      return 'downstream';
    }
    stack.push(...downstream);
  }
  return 'upstream';
};

const assetKeyTokensInRange = (
  {graph, from, to}: {graph: GraphData; from: GraphNode; to: GraphNode},
  seen: string[] = [],
) => {
  if (!from) {
    return [];
  }
  if (from.id === to.id) {
    return [tokenForAssetKey(to.definition.assetKey)];
  }

  if (seen.length === 0 && graphDirectionOf({graph, from, to}) === 'upstream') {
    [from, to] = [to, from];
  }

  const downstream = [...Object.keys(graph.downstream[from.id] || {})]
    .map((n) => graph.nodes[n]!)
    .filter(Boolean);

  const ledToTarget: string[] = [];

  for (const node of downstream) {
    if (seen.includes(node.id)) {
      continue;
    }
    const result: string[] = assetKeyTokensInRange({graph, from: node, to}, [...seen, from.id]);
    if (result.length) {
      ledToTarget.push(tokenForAssetKey(from.definition.assetKey), ...result);
    }
  }

  return uniq(ledToTarget);
};

const TopbarWrapper = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  background: white;
  gap: 12px;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid ${Colors.KeylineGray};
`;

const GraphQueryInputFlexWrap = styled.div`
  flex: 1;

  > ${Box} {
    ${TextInputContainer} {
      width: 100%;
    }
    > * {
      display: block;
      width: 100%;
    }
  }
`;

function filterEdges(
  edges: AssetLayoutEdge[],
  allowGroupsOnlyZoomLevel: boolean,
  scale: number,
  graphData: GraphData,
) {
  if (allowGroupsOnlyZoomLevel && scale < GROUPS_ONLY_SCALE) {
    return edges.filter((e) => {
      const fromAsset = graphData.nodes[e.fromId];
      const toAsset = graphData.nodes[e.toId];
      // If the assets are in the same asset group then filter out the edge
      return (
        fromAsset?.definition.groupName !== toAsset?.definition.groupName ||
        fromAsset?.definition.repository.id !== toAsset?.definition.repository.id ||
        fromAsset?.definition.repository.location.id !== toAsset?.definition.repository.location.id
      );
    });
  }
  return edges;
}
