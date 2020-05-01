package codenames

import (
	"encoding/json"
	"errors"
	"fmt"
	"math/rand"
	"time"
)

const wordsPerGame = 25

type Team int

const (
	Neutral Team = iota
	Red
	Blue
	RedBlue
	Black
	RedBlack
	BlueBlack
)

func (t Team) String() string {
	switch t {
	case Red:
		return "red"
	case Blue:
		return "blue"
	case RedBlue:
		return "red-blue"
	case RedBlack:
		return "red-black"
	case BlueBlack:
		return "blue-black"
	case Black:
		return "black"
	default:
		return "neutral"
	}
}

func (t Team) Other() Team {
	if t == Red {
		return Blue
	}
	if t == Blue {
		return Red
	}
	return t
}

func (t *Team) UnmarshalJSON(b []byte) error {
	var s string
	err := json.Unmarshal(b, &s)
	if err != nil {
		return err
	}

	switch s {
	case "red":
		*t = Red
	case "blue":
		*t = Blue
	case "red-blue":
		*t = RedBlue
	case "red-black":
		*t = RedBlack
	case "blue-black":
		*t = BlueBlack
	case "black":
		*t = Black
	default:
		*t = Neutral
	}
	return nil
}

func (t Team) MarshalJSON() ([]byte, error) {
	return json.Marshal(t.String())
}

func (t Team) Repeat(n int) []Team {
	s := make([]Team, n)
	for i := 0; i < n; i++ {
		s[i] = t
	}
	return s
}

// GameState encapsulates enough data to reconstruct
// a Game's state. It's used to recreate games after
// a process restart.
type GameState struct {
	Seed      int64    `json:"seed"`
	PermIndex int      `json:"perm_index"`
	Round     int      `json:"round"`
	Revealed  []bool   `json:"revealed"`
	WordSet   []string `json:"word_set"`
}

func (gs GameState) anyRevealed() bool {
	var revealed bool
	for _, r := range gs.Revealed {
		revealed = revealed || r
	}
	return revealed
}

func randomState(words []string) GameState {
	return GameState{
		Seed:      rand.Int63(),
		PermIndex: 0,
		Round:     0,
		Revealed:  make([]bool, wordsPerGame),
		WordSet:   words,
	}
}

// nextGameState returns a new GameState for the next game.
func nextGameState(state GameState) GameState {
	state.PermIndex = state.PermIndex + wordsPerGame
	if state.PermIndex+wordsPerGame >= len(state.WordSet) {
		state.Seed = rand.Int63()
		state.PermIndex = 0
	}
	state.Revealed = make([]bool, wordsPerGame)
	state.Round = 0
	return state
}

type Game struct {
	GameState
	ID              string    `json:"id"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
	HasWon			bool	  `json:"has_won,omitempty"`
	HasLost		    bool      `json:"has_lost,omitempty"`
	Words           []string  `json:"words"`
	Layout          []Team    `json:"layout"`
	TimerDurationMS int64     `json:"timer_duration_ms,omitempty"`
	RoundStartedAt  time.Time `json:"round_started_at,omitempty"`
	EnforceTimer    bool      `json:"enforce_timer,omitempty"`
}

func (g *Game) StateID() string {
	return fmt.Sprintf("%019d", g.UpdatedAt.UnixNano())
}

func (g *Game) checkWinningCondition() {
	var remainingCards bool
	for i, t := range g.Layout {
		if g.Revealed[i] {
			continue
		}

		switch t {
		case Red:
			fallthrough
		case Blue:
			fallthrough
		case RedBlue:
			g.HasWon = false
			remainingCards = true
		}
	}

	if !remainingCards {
		g.HasWon = true
	}
}

func (g *Game) NextTurn(currentTurn int) bool {
	if !g.HasWon && !g.HasLost {
		return false
	}

	// TODO: remove currentTurn != 0 once we can be sure all
	// clients are running up-to-date versions of the frontend.
	if g.Round != currentTurn && currentTurn != 0 {
		return false
	}
	g.UpdatedAt = time.Now()
	g.Round++
	g.RoundStartedAt = time.Now()
	return true
}

func (g *Game) Guess(idx int) error {
	if idx > len(g.Layout) || idx < 0 {
		return fmt.Errorf("index %d is invalid", idx)
	}
	if g.Revealed[idx] {
		return errors.New("cell has already been revealed")
	}
	g.UpdatedAt = time.Now()
	g.Revealed[idx] = true

	if g.Layout[idx] == Black || g.Layout[idx] == BlueBlack || g.Layout[idx] == RedBlack {
		g.HasLost = true
		return nil
	}

	g.checkWinningCondition()

	return nil
}

func newGame(id string, state GameState, timerDurationMS int64, enforceTimer bool) *Game {
	// consistent randomness across games with the same seed
	seedRnd := rand.New(rand.NewSource(state.Seed))
	// distinct randomness across games with same seed
	randRnd := rand.New(rand.NewSource(state.Seed * int64(state.PermIndex+1)))

	game := &Game{
		ID:              id,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
		Words:           make([]string, 0, wordsPerGame),
		Layout:          make([]Team, 0, wordsPerGame),
		GameState:       state,
		TimerDurationMS: timerDurationMS,
		RoundStartedAt:  time.Now(),
		EnforceTimer:    enforceTimer,
	}

	// Pick the next `wordsPerGame` words from the
	// randomly generated permutation
	perm := seedRnd.Perm(len(state.WordSet))
	permIndex := state.PermIndex
	for _, i := range perm[permIndex : permIndex+wordsPerGame] {
		w := state.WordSet[perm[i]]
		game.Words = append(game.Words, w)
	}

	// Pick a random permutation of team assignments.
	var teamAssignments []Team
	teamAssignments = append(teamAssignments, Red.Repeat(6)...)
	teamAssignments = append(teamAssignments, Blue.Repeat(6)...)
	teamAssignments = append(teamAssignments, RedBlue.Repeat(3)...)
	teamAssignments = append(teamAssignments, RedBlack.Repeat(2)...)
	teamAssignments = append(teamAssignments, BlueBlack.Repeat(2)...)
	teamAssignments = append(teamAssignments, Black)
	teamAssignments = append(teamAssignments, Neutral.Repeat(5)...)

	shuffleCount := randRnd.Intn(5) + 5
	for i := 0; i < shuffleCount; i++ {
		shuffle(randRnd, teamAssignments)
	}
	game.Layout = teamAssignments
	return game
}

func shuffle(rnd *rand.Rand, teamAssignments []Team) {
	for i := range teamAssignments {
		j := rnd.Intn(i + 1)
		teamAssignments[i], teamAssignments[j] = teamAssignments[j], teamAssignments[i]
	}
}
