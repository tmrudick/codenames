import * as React from 'react';
import { Settings, SettingsButton, SettingsPanel } from '~/ui/settings';
import Timer from '~/ui/timer';

// TODO: remove jquery dependency
// https://stackoverflow.com/questions/47968529/how-do-i-use-jquery-and-jquery-ui-with-parcel-bundler
let jquery = require('jquery');
window.$ = window.jQuery = jquery;

const defaultFavicon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAA8SURBVHgB7dHBDQAgCAPA1oVkBWdzPR84kW4AD0LCg36bXJqUcLL2eVY/EEwDFQBeEfPnqUpkLmigAvABK38Grs5TfaMAAAAASUVORK5CYII=';
const blueTurnFavicon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAmSURBVHgB7cxBAQAABATBo5ls6ulEiPt47ASYqJ6VIWUiICD4Ehyi7wKv/xtOewAAAABJRU5ErkJggg==';
const redTurnFavicon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAmSURBVHgB7cwxAQAACMOwgaL5d4EiELGHoxGQGnsVaIUICAi+BAci2gJQFUhklQAAAABJRU5ErkJggg==';
export class Game extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      game: null,
      mounted: true,
      settings: Settings.load(),
      mode: 'game',
      team: 'red',
      hasWon: false,
      hasLost: false,
    };
  }

  public extraClasses() {
    var classes = '';
    if (this.state.settings.colorBlind) {
      classes += ' color-blind';
    }
    if (this.state.settings.darkMode) {
      classes += ' dark-mode';
    }
    if (this.state.settings.fullscreen) {
      classes += ' full-screen';
    }
    return classes;
  }

  public handleKeyDown(e) {
    if (e.keyCode == 27) {
      this.setState({ mode: 'game' });
    }
  }

  public componentDidMount(prevProps, prevState) {
    window.addEventListener('keydown', this.handleKeyDown.bind(this));
    this.setDarkMode(prevProps, prevState);
    this.refresh();
  }

  public componentWillUnmount() {
    window.removeEventListener('keydown', this.handleKeyDown.bind(this));
    document.getElementById("favicon").setAttribute("href", defaultFavicon);
    this.setState({ mounted: false });
  }

  public componentDidUpdate(prevProps, prevState) {
    this.setDarkMode(prevProps, prevState);
  }

  private setDarkMode(prevProps, prevState) {
    if (!prevState?.settings.darkMode && this.state.settings.darkMode) {
      document.body.classList.add('dark-mode');
    }
    if (prevState?.settings.darkMode && !this.state.settings.darkMode) {
      document.body.classList.remove('dark-mode');
    }
  }

  public refresh() {
    if (!this.state.mounted) {
      return;
    }

    let state_id = '';
    if (this.state.game && this.state.game.state_id) {
      state_id = this.state.game.state_id;
    }

    const body = { game_id: this.props.gameID, state_id: state_id };
    $.ajax({
      url: '/game-state',
      type: 'POST',
      data: JSON.stringify(body),
      contentType: 'application/json; charset=utf-8',
      dataType: 'json',
      success: data => {
        this.setState({ game: data });
      },
      complete: () => {
        setTimeout(() => {
          this.refresh();
        }, 2000);
      },
    });
  }

  public toggleRole(e, role) {
    e.preventDefault();
    this.setState({ team: role == 'red' ? 'red' : 'blue' })
  }

  public guess(e, idx) {
    e.preventDefault();
    if (this.state.game.revealed[idx]) {
      return; // ignore if already revealed
    }
    if (this.state.game.winning_team) {
      return; // ignore if game is over
    }
    $.post(
      '/guess',
      JSON.stringify({
        game_id: this.state.game.id,
        index: idx,
      }),
      g => {
        this.setState({ game: g });
      }
    );
  }

  public remaining() {
    var count = 0;
    for (var i = 0; i < this.state.game.revealed.length; i++) {
      if (this.state.game.revealed[i]) {
        continue;
      }

      const card = this.state.game.layout[i];
      if (card.indexOf('black') == -1 &&
        card !== 'neutral') {
        count++
      }
    }
    return count;
  }

  public nextGame(e) {
    e.preventDefault();
    // Ask for confirmation when current game hasn't finished
    let allowNextGame =
      this.state.game.winning_team ||
      confirm('Do you really want to start a new game?');
    if (!allowNextGame) {
      return;
    }
    $.post(
      '/next-game',
      JSON.stringify({
        game_id: this.state.game.id,
        word_set: this.state.game.word_set,
        create_new: true,
        timer_duration_ms: this.state.game.timer_duration_ms,
      }),
      g => {
        this.setState({ game: g });
      }
    );
  }

  public toggleSettingsView(e) {
    if (e != null) {
      e.preventDefault();
    }
    if (this.state.mode == 'settings') {
      this.setState({ mode: 'game' });
    } else {
      this.setState({ mode: 'settings' });
    }
  }

  public toggleSetting(e, setting) {
    if (e != null) {
      e.preventDefault();
    }
    const vals = { ...this.state.settings };
    vals[setting] = !vals[setting];
    this.setState({ settings: vals });
    Settings.save(vals);
  }

  public getTeamClassName(card) {
    if (card.indexOf('black') != -1) {
      return 'black';
    }

    if (card.indexOf(this.state.team) != -1) {
      return this.state.team;
    }

    return card
  }

  render() {
    if (!this.state.game) {
      return <p className="loading">Loading&hellip;</p>;
    }
    if (this.state.mode == 'settings') {
      return (
        <SettingsPanel
          toggleView={e => this.toggleSettingsView(e)}
          toggle={(e, setting) => this.toggleSetting(e, setting)}
          values={this.state.settings}
        />
      );
    }

    let status, statusClass;
    
    if (this.state.game.has_lost) {
      status = 'You Lose';
    } else if (this.state.game.has_won) {
      status = 'You Win!';
    }

    let shareLink = null;
    if (!this.state.settings.fullscreen) {
      shareLink = (
        <div id="share">
          Send this link to friends:&nbsp;
          <a className="url" href={window.location.href}>
            {window.location.href}
          </a>
        </div>
      );
    }

    const timer = !!this.state.game.timer_duration_ms && (
      <div id="timer">
        <Timer
          roundStartedAt={this.state.game.round_started_at}
          timerDurationMs={this.state.game.timer_duration_ms}
          handleExpiration={() => {
              this.state.game.enforce_timer && this.endTurn();
          }}
          freezeTimer={!!this.state.game.winning_team}
        />
      </div>
    );

    return (
      <div
        id="game-view"
        className={
          (`${this.state.team}-team`) +
          this.extraClasses()
        }
      >
        <div id="infoContent">
          {shareLink}
          {timer}
        </div>
        <div id="status-line" className={statusClass}>
          <div id="remaining">
            <span>{this.remaining()}</span>
          </div>
          <div id="status" className="status-text">
            {status}
          </div>
        </div>
        <div className={"board " + statusClass}>
          {this.state.game.words.map((w, idx) => (
            <div
              key={idx}
              className={
                'cell ' +
                this.getTeamClassName(this.state.game.layout[idx]) +
                ' ' +
                (this.state.game.revealed[idx] ? 'revealed' : 'hidden-word')
              }
              onClick={e => this.guess(e, idx, w)}
            >
              <span className="word">{w}</span>
            </div>
          ))}
        </div>
        <form
          id="mode-toggle"
          className={`${this.state.team}-selected`}
        >
          <SettingsButton
            onClick={e => {
              this.toggleSettingsView(e);
            }}
          />
          <button
            onClick={e => this.toggleRole(e, 'blue')}
            className="blue"
          >
            Blue
          </button>
          <button
            onClick={e => this.toggleRole(e, 'red')}
            className="red"
          >
            Red
          </button>
          <button onClick={e => this.nextGame(e)} id="next-game-btn">
            Next game
          </button>
        </form>
        <div id="coffee"><a href="https://www.buymeacoffee.com/jbowens" target="_blank">Buy the developer a coffee.</a></div>
      </div>
    );
  }
}
