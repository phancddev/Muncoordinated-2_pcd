import * as React from 'react';
import firebase from 'firebase/compat/app';
import {
  MemberData,
  MemberID,
  Rank,
  nameToFlagCode,
  nameToMemberOption,
  MemberOption
} from '../modules/member';
import { Dropdown, Flag, Table, Button, Checkbox,
  CheckboxProps, DropdownProps, ButtonProps, Container, Message, Icon, Grid } from 'semantic-ui-react';
import { checkboxHandler, dropdownHandler } from '../modules/handlers';
import { makeDropdownOption } from '../utils';
import _ from 'lodash';
import { URLParameters } from '../types';
import { RouteComponentProps } from 'react-router';
import { logClickGeneralSpeakersList } from '../modules/analytics';
import { CommitteeStatsTable } from '../modules/committee-stats';
import {CommitteeData, CommitteeID, pushMember, Template} from '../models/committee';
import { TemplateAdder } from '../components/template';
import {COUNTRY_OPTIONS} from "../constants";
import { Helmet } from 'react-helmet';

interface Props extends RouteComponentProps<URLParameters> {
  committee: CommitteeData;
  fref: firebase.database.Reference;
}

interface State {
  template?: Template;
  member: MemberOption;
  options: MemberOption[];
  rank: Rank;
  voting: MemberData['voting'];
  present: MemberData['present'];
  showStats: boolean; // New state property to control stats table visibility
}

const RANK_OPTIONS = [
  Rank.Standard,
  Rank.Veto,
  Rank.NGO,
  Rank.Observer
].map(makeDropdownOption);

export default class Admin extends React.Component<Props, State> {
  // Reference to the country search dropdown
  private countrySearchRef = React.createRef<Dropdown>();

  constructor(props: Props) {
    super(props);

    this.state = {
      member: COUNTRY_OPTIONS[0],
      options: [],
      rank: Rank.Standard,
      voting: false,
      present: true,
      showStats: true // Default to showing stats
    };
  }

  componentDidMount() {
    // Add event listener for keyboard shortcuts
    document.addEventListener('keydown', this.handleKeyDown);
  }

  componentWillUnmount() {
    // Remove event listener when component unmounts
    document.removeEventListener('keydown', this.handleKeyDown);
  }

  // Handle keyboard shortcuts
  handleKeyDown = (event: KeyboardEvent) => {
    // Check if Ctrl+H is pressed
    if (event.ctrlKey && event.key === 'h') {
      event.preventDefault(); // Prevent browser's default action
      
      // Find the search input by its class and focus on it
      const searchInput = document.querySelector('.adder__dropdown--select-member input.search');
      
      if (searchInput) {
        (searchInput as HTMLElement).focus();
        (searchInput as HTMLInputElement).select(); // Optional: select any existing text
      }
    }
    
    // Check if Ctrl+Shift+E is pressed to toggle stats visibility
    if (event.ctrlKey && event.shiftKey && event.key === 'E') {
      event.preventDefault(); // Prevent browser's default action
      this.toggleStatsVisibility(); // Toggle stats visibility
    }
  }

  // Toggle stats table visibility
  toggleStatsVisibility = () => {
    this.setState(prevState => ({
      showStats: !prevState.showStats
    }));
  }

  // Toggle all members' present status
  toggleAllPresent = () => {
    const { committee } = this.props;
    const members = committee.members || {};
    
    // Determine the new value (toggle the current state)
    const areAllPresent = Object.values(members).length > 0 && 
      Object.values(members).every(member => member.present);
    const newValue = !areAllPresent;
    
    // Update all members
    Object.keys(members).forEach(id => {
      const memberRef = firebase.database()
        .ref(`committees/${this.props.match.params.committeeID}/members/${id}`);
      
      memberRef.update({ present: newValue });
      
      // If setting present to false, also set voting to false
      if (!newValue) {
        memberRef.update({ voting: false });
      }
    });
  }

  // Toggle all members' voting status
  toggleAllVoting = () => {
    const { committee } = this.props;
    const members = committee.members || {};
    
    // Only apply to members that are present
    const presentMembers = Object.entries(members)
      .filter(([_, member]) => member.present);
    
    // Determine the new value (toggle the current state)
    const areAllVoting = presentMembers.length > 0 && 
      presentMembers.every(([_, member]) => member.voting);
    const newValue = !areAllVoting;
    
    // Update all present members
    presentMembers.forEach(([id]) => {
      const memberRef = firebase.database()
        .ref(`committees/${this.props.match.params.committeeID}/members/${id}`);
      
      memberRef.update({ voting: newValue });
    });
  }

  renderMemberItem = (id: MemberID, member: MemberData, fref: firebase.database.Reference) => {
    // Create a custom checkbox handler for present that also updates voting if needed
    const handlePresentChange = (event: React.FormEvent<HTMLInputElement>, data: CheckboxProps) => {
      const newPresent = data.checked ?? false;
      fref.update({ present: newPresent });
      
      // If present is being set to false, also set voting to false
      if (!newPresent) {
        fref.update({ voting: false });
      }
    };

    // Create a custom checkbox handler for voting that only works when present is true
    const handleVotingChange = (event: React.FormEvent<HTMLInputElement>, data: CheckboxProps) => {
      if (member.present) {
        fref.update({ voting: data.checked ?? false });
      }
    };

    return (
      <Table.Row key={id}>
        <Table.Cell>
          <Flag name={nameToFlagCode(member.name)} />
          {member.name}
        </Table.Cell>
        <Table.Cell>
          <Dropdown
            search
            selection
            fluid
            options={RANK_OPTIONS}
            onChange={dropdownHandler<MemberData>(fref, 'rank')}
            value={member.rank}
          />
        </Table.Cell>
        <Table.Cell style={{ width: '100px', textAlign: 'center', verticalAlign: 'middle' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Checkbox 
              toggle 
              checked={member.present} 
              onChange={handlePresentChange}
            />
          </div>
        </Table.Cell>
        <Table.Cell style={{ width: '100px', textAlign: 'center', verticalAlign: 'middle' }}>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Checkbox 
              toggle 
              checked={member.voting} 
              onChange={handleVotingChange}
              disabled={!member.present}
            />
          </div>
        </Table.Cell>
        <Table.Cell collapsing>
          <Button
            className="members__button--remove-member"
            icon="trash"
            negative
            basic
            onClick={() => fref.remove()}
          />
        </Table.Cell>
      </Table.Row>
    );
  }

  canPushMember = (member: MemberOption) => { 
    const members = this.props.committee.members || {};
    const memberNames = Object.keys(members).map(id => 
      members[id].name
    );

    return !_.includes(memberNames, member.text);
  }

  pushSelectedMember = (event: React.MouseEvent<HTMLButtonElement>, data: ButtonProps) => {
    event.preventDefault();

    const committeeID: CommitteeID = this.props.match.params.committeeID;
    const member: MemberData = {
      name: this.state.member.text,
      rank: this.state.rank,
      present: this.state.present,
      voting: this.state.present && this.state.voting // Only set voting true if present is true
    };

    pushMember(committeeID, member);
  }

  setMember = (event: React.SyntheticEvent<HTMLElement>, data: DropdownProps) => {
    const { options: newOptions } = this.state;
    const newMember = [...newOptions, ...COUNTRY_OPTIONS].filter(c => c.value === data.value)[0];

    if (newMember) {
      this.setState({ member: newMember });
    }
  }

  setPresent = (event: React.FormEvent<HTMLInputElement>, data: CheckboxProps) => {
    const present = data.checked ?? false;
    this.setState({ 
      present: present,
      // If present is set to false, also set voting to false
      voting: present ? this.state.voting : false
    });
  }

  setVoting = (event: React.FormEvent<HTMLInputElement>, data: CheckboxProps) => {
    // Only allow setting voting if present is true
    if (this.state.present) {
      this.setState({ voting: data.checked ?? false });
    }
  }

  setRank = (event: React.SyntheticEvent<HTMLElement>, data: DropdownProps) => {
    this.setState({ rank: data.value as Rank ?? Rank.Standard });
  }

  handleAdd = (event: React.SyntheticEvent<HTMLElement>, data: DropdownProps) => {
    // FSM looks sorta like the UN flag
    const newMember = nameToMemberOption((data.value as number | string).toString());

    if (_.includes(COUNTRY_OPTIONS, newMember)) {
      this.setState({ member: newMember });
    } else {
      const newOptions = [ newMember, ...this.state.options ];
      this.setState({ member: newMember, options: newOptions });
    }
  }

  gotoGSL = () => {
    const { committeeID } = this.props.match.params;

    this.props.history
      .push(`/committees/${committeeID}/caucuses/gsl`);

    logClickGeneralSpeakersList();
  }


  renderAdder() {
    const { handleAdd, setMember, setRank, setPresent, setVoting } = this;
    const { present: newMemberPresent, voting: newMemberVoting, options: newOptions, member } = this.state;

    return (
      <Table.Row>
        <Table.HeaderCell>
          <Dropdown
            ref={this.countrySearchRef}
            icon="search"
            className="adder__dropdown--select-member"
            placeholder="Select preset member"
            search
            selection
            fluid
            allowAdditions
            error={!this.canPushMember(member)}
            options={[...newOptions, ...COUNTRY_OPTIONS]}
            onAddItem={handleAdd}
            onChange={setMember}
            value={member.key}
          />
        </Table.HeaderCell>
        <Table.HeaderCell>
          <Dropdown
            className="adder__dropdown--select-rank"
            search
            selection
            fluid
            options={RANK_OPTIONS}
            onChange={setRank}
            value={this.state.rank}
          />
        </Table.HeaderCell>
        <Table.HeaderCell style={{ width: '100px', textAlign: 'center', verticalAlign: 'middle' }} >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Checkbox 
              className="adder__checkbox--toggle-present"
              toggle 
              checked={newMemberPresent} 
              onChange={setPresent} 
            />
          </div>
        </Table.HeaderCell>
        <Table.HeaderCell style={{ width: '100px', textAlign: 'center', verticalAlign: 'middle' }} >
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Checkbox 
              className="adder__checkbox--toggle-voting"
              toggle 
              checked={newMemberVoting}
              disabled={!newMemberPresent}
              onChange={setVoting} 
            />
          </div>
        </Table.HeaderCell>
        <Table.HeaderCell>
          <Button
            className="adder__button--add-member"
            icon="plus"
            primary
            basic
            disabled={!this.canPushMember(member)}
            onClick={this.pushSelectedMember}
          />
        </Table.HeaderCell>
      </Table.Row>
    );
  }

  renderCommitteeMembers = (props: { data: CommitteeData, fref: firebase.database.Reference }) => {
    const members = this.props.committee.members || {};
    const memberItems = Object.keys(members).map(id =>
      this.renderMemberItem(id, members[id], props.fref.child('members').child(id))
    );

    // Calculate if any member is not present or not voting
    const areAllPresent = Object.values(members).length > 0 && 
      Object.values(members).every(member => member.present);
    
    const presentMembers = Object.values(members).filter(member => member.present);
    const areAllVoting = presentMembers.length > 0 && 
      presentMembers.every(member => member.voting);

    return (
      <>
        <Table compact celled definition>
          <Table.Header>
            <Table.Row>
              <Table.HeaderCell />
              <Table.HeaderCell style={{ width: '30%', verticalAlign: 'middle' }}>Rank</Table.HeaderCell>
              <Table.HeaderCell style={{ width: '100px', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '8px' }}>
                  <span>Present</span>
                  {memberItems.length > 0 && (
                    <Checkbox 
                      toggle 
                      className="header-toggle" 
                      checked={areAllPresent}
                      onChange={this.toggleAllPresent}
                      title={areAllPresent ? "Set all not present" : "Set all present"}
                    />
                  )}
                </div>
              </Table.HeaderCell>
              <Table.HeaderCell style={{ width: '100px', textAlign: 'center', verticalAlign: 'middle' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexDirection: 'column', gap: '8px' }}>
                  <span>Voting</span>
                  {memberItems.length > 0 && (
                    <Checkbox 
                      toggle 
                      className="header-toggle" 
                      checked={areAllVoting}
                      onChange={this.toggleAllVoting}
                      disabled={!Object.values(members).some(member => member.present)}
                      title={areAllVoting ? "Set all non-voting" : "Set all voting"}
                    />
                  )}
                </div>
              </Table.HeaderCell>
              <Table.HeaderCell />
            </Table.Row>
          </Table.Header>

          <Table.Header fullWidth>
            {this.renderAdder()}
          </Table.Header>

          <Table.Body>
            {memberItems.reverse()}
          </Table.Body>
        </Table>
        {memberItems.length === 0
          ? <Message error>
            Add at least one committee member to proceed
          </Message>
          : <Button
            as='a'
            onClick={this.gotoGSL}
            primary
            fluid
          >
            General Speakers' List
              <Icon name="arrow right" />
          </Button>
        }
      </>
    );
  }

  render() {
    const { committee, fref } = this.props;
    const { showStats } = this.state;

    return (
      <Container style={{ padding: '1em 0em 1.5em' }}>
        <Helmet>
          <title>{`Setup - Muncoordinated`}</title>
        </Helmet>
        
        {/* Add toggle button at the top */}
        <div style={{ marginBottom: '1em', textAlign: 'right' }}>
          <Button 
            toggle 
            active={showStats} 
            onClick={this.toggleStatsVisibility}
          >
            <Icon name="chart bar" />
            {showStats ? 'Hide Stats' : 'Show Stats'}
          </Button>
        </div>
        
        <Grid columns={showStats ? "2" : "1"} stackable>
          <Grid.Row>
            <Grid.Column width={showStats ? 9 : 16}>
              <TemplateAdder committeeID={this.props.match.params.committeeID} />
              {this.renderCommitteeMembers({ data: committee, fref })}
            </Grid.Column>
            
            {showStats && (
              <Grid.Column width={7}>
                <CommitteeStatsTable verbose={true} data={committee} />
              </Grid.Column>
            )}
          </Grid.Row>
        </Grid>
      </Container>
    );
  }
}