import React from 'react';
import {
  map,
  every,
  sumBy,
  defer,
  invokeMap,
  omit,
  assign,
} from 'lodash';
import {
  reaction,
  observable,
  computed,
  toJS,
  action,
  when
} from 'mobx';
import { observer } from 'mobx-react';
import jsmediatags from 'jsmediatags';
import * as localForage from 'localforage';
import './App.css';

class Chapter {
  @observable duration = null;
  @observable.shallow tags = null;
  @observable file = null;

  constructor(chapter) {
    assign(this, chapter);
  }

  @computed
  get title() {
    return this.tags.title;
  }

  @computed
  get url() {
    return URL.createObjectURL(this.file);
  }

  @computed
  get ready() {
    return  !!(this.file && this.tags && this.duration);
  }

  @action.bound
  setChapterFile(file) {
    if (!this.file || this.file !== file) {
      defer(this.init);
    }
    this.file = file;
  }

  @action.bound
  setTags(tags) {
    this.tags = tags;
  }

  @action.bound
  setDuration(duration) {
    this.duration = duration;
  }

  init() {
    if (!this.ready) {
      new jsmediatags.Reader(this.file)
      .read({
        onSuccess: ({ tags }) => {
          this.setTags(tags);
        }
      });

      const au = document.createElement('audio');
      au.src = this.url;
      au.addEventListener('loadedmetadata', () => {
        this.setDuration(parseInt(au.duration));
      }, false);
    }
  }
};

class Book {
  @observable title = null;
  @observable currentChapterIndex = 0;
  @observable currentChapterTime = 0;
  @observable chapters = [];

  constructor(book) {
    console.time(book.title);
    assign(this, omit(book, 'chapters'));
    this.chapters = map(book.chapters, chapter => new Chapter(chapter));
    invokeMap(this.chapters, 'init');
  }

  @computed
  get ready() {
    const ready = every(map(this.chapters, 'ready'));
    if (ready) {
      console.timeEnd(this.title);
    }
    return ready;
  }

  @computed
  get totalDuration() {
    return sumBy(this.chapters, 'duration');
  }

  @computed
  get currentChapter() {
    return this.chapters[this.currentChapterIndex];
  }

  @action.bound
  setCurrentChapterIndex(currentChapterIndex) {
    this.currentChapterIndex = currentChapterIndex;
  }

  @action.bound
  setCurrentChapterTime(currentChapterTime) {
    this.currentChapterTime = currentChapterTime;
  }
}


class Controller {
  @observable playbackRate = 1;
  @observable currentBookIndex = -1;
  @observable books = [];
  @observable loading = false;

  audioElement = null;

  constructor() {
    console.log(`WHY WHY WHY`);
    this.init(); 
  }

  @computed
  get currentBook() {
    return this.books[this.currentBookIndex];
  }

  @computed
  get snapshot() {
    return omit({
      ...toJS(this),
      books: toJS(this.books)
    }, 'audioElement');
  }

  @action.bound
  async init() {
    this.loading = true;
    const state = await localForage.getItem('state');
    console.time('huh')
    if (state) {
      assign(this, omit(state, 'books'));
      this.books = map(state.books, book => new Book(book));
    }
    console.timeEnd('huh');

    reaction(
      () => [this.snapshot],
      snapshot => {
        console.log(`snapshot`, snapshot);
        localForage.setItem('state', ...snapshot)
      },
      { delay: 500 }
    );

    this.loading = false;
  }

  @action.bound
  setCurrentBookIndex(currentBookIndex) {
    this.currentBookIndex = currentBookIndex;
  }

  @action.bound
  setChapters(chapters) {
    const book = new Book({ title: `New Book ${this.books.length + 1}`, chapters: map(chapters, chapter => new Chapter({ file: chapter}))});
    this.books.push(book);
  }

  @action.bound
  setAudioElement(audioElement) {
    this.audioElement = audioElement;
  }

  @action.bound
  async playChapter(chapter, i) {
    this.currentBook.setCurrentChapterIndex(i);
    when(
      () => chapter.ready,
      () => {
        this.audioElement.src = chapter.url;
        this.audioElement.play();
        this.setPlaybackRate(this.playbackRate);
        window.document.title = chapter.title;
      }
    );
  }

  @action.bound
  setPlaybackRate(playbackRate) {
    this.playbackRate = playbackRate;
    this.audioElement.playbackRate = playbackRate;
  }

  @action.bound
  adjustPlaybackRate(adjustment) {
    this.setPlaybackRate(this.playbackRate + adjustment)
  }
}

@observer
class App extends React.PureComponent {
  constructor(props) {
    super(props);
    this.c = new Controller();
    this.audioElement = React.createRef();
  }

  render() {
    return (
      <div>
        <input
          id="chapter-input"
          onChange={(e) => this.c.setChapters(e.currentTarget.files)}
          type="file"
          multiple
          accept="audio/mp3"
        />

      {map(this.c.books, (book, i) => {
        return (
          book.ready && (
            <div onClick={() => this.c.setCurrentBookIndex(i)}>
              {book.title}
            </div>
          )
        )}
      )}

        {this.c.currentBook && this.c.currentBook.ready && (
          map(this.c.currentBook.chapters, (chapter, i) => (
            <div key={chapter.title} onClick={() => this.c.playChapter(chapter, i)}>{this.c.currentBook.currentChapter === chapter ? '->' : '' } {chapter.title}</div>
          ))
        )}

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

export default App;
