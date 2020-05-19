import React from 'react';
import { map } from 'lodash';
import { reaction, when } from 'mobx';
import { observer } from 'mobx-react';
import { types, applySnapshot, onSnapshot, getSnapshot } from 'mobx-state-tree';
import * as localForage from 'localforage';
import './App.css';

const { model } = types;

const Controller = model('AppController', {
  playbackRate: 1,
})
.volatile(() => ({
  songs: [],
  audioElement: null,
}))
.actions(self => ({
  afterCreate() {
    self.init();
  },
  async init() {

    const state = await localForage.getItem('state');
    applySnapshot(self, state);

    if (state.songs) {
      self.setSongs(state.songs);
    }

    reaction(
      () => [getSnapshot(self), self.songs],
      ([snapshot, songs]) => localForage.setItem('state', { ...snapshot, songs })
    );

    when(
      () => self.audioElement,
      () => {
        self.setPlaybackRate(self.playbackRate);
      }
    );
  },
  setSongs(songs) {
    self.songs = songs;
  },
  setAudioElement(audioElement) {
    self.audioElement = audioElement;
  },
  playSong(song) {
    const fileSrc = URL.createObjectURL(song);
    self.audioElement.src = fileSrc;
    self.audioElement.play();
    self.setPlaybackRate(self.playbackRate);
    window.document.title = song.name.replace('.mp3', '');
  },
  setPlaybackRate(playbackRate) {
    self.playbackRate = playbackRate;
    self.audioElement.playbackRate = playbackRate;
  },
  adjustPlaybackRate(adjustment) {
    self.setPlaybackRate(self.playbackRate + adjustment)
  }
}))

class App extends React.PureComponent {
  constructor(props) {
    super(props);
    this.c = Controller.create()
    this.audioElement = React.createRef();
  }

  render() {
    return (
      <div>
        <input
          id="song-input"
          onChange={(e) => this.c.setSongs(e.currentTarget.files)}
          type="file"
          multiple
          accept="audio/mp3"
        />
        {map(this.c.songs, song => (
          <div key={song.name} onClick={() => this.c.playSong(song)}>{song.name}</div>
        ))}

        <audio
          controls
          ref={(e) => this.c.setAudioElement(e)}
        >
          <track />
        </audio>
        <div>
          {this.c.playbackRate}
        </div>
        <button onClick={() => this.c.setPlaybackRate(2)}>2</button>
        <button onClick={() => this.c.setPlaybackRate(1.5)}>1.5</button>
        <button onClick={() => this.c.setPlaybackRate(1)}>1</button>

        <button onClick={() => this.c.adjustPlaybackRate(.1)}>+.1</button>
        <button onClick={() => this.c.adjustPlaybackRate(.01)}>+.01</button>
        <button onClick={() => this.c.adjustPlaybackRate(-.1)}>-.1</button>
        <button onClick={() => this.c.adjustPlaybackRate(-.01)}>-.01</button>
      </div>
    );
  }
}

export default observer(App);
