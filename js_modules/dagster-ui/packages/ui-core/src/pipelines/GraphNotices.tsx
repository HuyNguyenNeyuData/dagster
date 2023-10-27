import {Box, Colors, Icon, NonIdealState, Spinner} from '@dagster-io/ui-components';
import capitalize from 'lodash/capitalize';
import * as React from 'react';
import styled from 'styled-components';

export const LargeDAGNotice = ({
  nodeType,
  anchorLeft = '40px',
}: {
  nodeType: 'op' | 'asset';
  anchorLeft?: string;
}) => (
  <LargeDAGContainer style={{left: anchorLeft}}>
    <Icon name="arrow_upward" size={24} />
    <LargeDAGInstructionBox>
      <p>
        This is a large DAG that may be difficult to visualize. Type <code>*</code> in the graph
        filter bar to render the entire thing, or type {nodeType} names and use:
      </p>
      <ul style={{marginBottom: 0}}>
        <li>
          <code>+</code> to expand a single layer before or after the {nodeType}.
        </li>
        <li>
          <code>*</code> to expand recursively before or after the {nodeType}.
        </li>
        <li>
          <code>AND</code> to render another disconnected fragment.
        </li>
      </ul>
    </LargeDAGInstructionBox>
  </LargeDAGContainer>
);

export const EmptyDAGNotice = ({
  isGraph,
  nodeType,
}: {
  isGraph: boolean;
  nodeType: 'asset' | 'op';
}) => {
  return (
    <CenteredContainer>
      <NonIdealState
        icon="no-results"
        title={isGraph ? 'Empty graph' : 'Empty job'}
        description={
          <div>
            This {isGraph ? 'graph' : 'job'} is empty. {capitalize(nodeType)}s will appear here when
            they are added to your definitions.
          </div>
        }
      />
    </CenteredContainer>
  );
};

export const EntirelyFilteredDAGNotice = ({nodeType}: {nodeType: 'asset' | 'op'}) => {
  return (
    <CenteredContainer>
      <NonIdealState
        icon="no-results"
        title="Nothing to display"
        description={
          <div>
            No {nodeType}s match your query filter. Try removing your filter, typing <code>*</code>{' '}
            to render the entire graph, or entering another filter string.
          </div>
        }
      />
    </CenteredContainer>
  );
};

export const LoadingNotice = (props: {async: boolean; nodeType: 'asset' | 'op'}) => {
  const {async} = props;
  return (
    <LoadingContainer>
      {async ? (
        <Box margin={{bottom: 24}}>Rendering a large number of {props.nodeType}s, please wait…</Box>
      ) : null}
      <Spinner purpose="page" />
    </LoadingContainer>
  );
};

const LoadingContainer = styled.div`
  background-color: ${Colors.White};
  position: absolute;
  top: 57px;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 2;
`;

const CenteredContainer = styled.div`
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 2;
`;

const LargeDAGContainer = styled.div`
  width: 45vw;
  position: absolute;
  top: 60px;
  z-index: 2;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  [role='img'] {
    opacity: 0.5;
    margin-left: 10vw;
  }
`;

const LargeDAGInstructionBox = styled.div`
  padding: 15px 20px;
  border: 1px solid #fff5c3;
  margin-top: 20px;
  color: ${Colors.Gray800};
  background: #fffbe5;
  text-align: left;
  line-height: 1.4rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  code {
    background: #f8ebad;
    font-weight: 500;
    padding: 0 4px;
  }
`;
