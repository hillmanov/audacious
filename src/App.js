import React from 'react';
import {
  map,
  every,
  sumBy,
  omit,
} from 'lodash';
import {
  reaction,
  when
} from 'mobx';
import {
  types,
  applySnapshot,
  getSnapshot,
  flow,
} from 'mobx-state-tree';
import { observer } from 'mobx-react';
import jsmediatags from 'jsmediatags';
import * as localForage from 'localforage';
import './App.css';

const { model, optional, frozen, array, string, number } = types;

const Chapter = model({
  duration: optional(number, 0),
  tags: frozen(),
  ready: false,
})
.volatile(() => ({
  file: {},
}))
.actions(self => ({
  setFile(file) {
    self.file = file;
    self.initialize();
  },
  setReady(ready) {
    self.ready = ready;
  },
  setTags(tags) {
    self.tags = tags;
  },
  setDuration(duration) {
    self.duration = duration;
  },
  initialize() {
    when(
      () => self.tags && self.duration,
      () => self.setReady(true)
    );

    new jsmediatags.Reader(self.file)
    .read({
      onSuccess: ({ tags }) => {
        self.setTags(tags);
      }
    });

    console.time(self.file.name);
    const au = document.createElement('audio');
    au.src = self.url;
    au.addEventListener('loadedmetadata', () => {
      console.timeEnd(self.file.name);
      self.setDuration(parseInt(au.duration));
    }, false);
  }
}))
.views(self => ({
  get snapshot() { // A non-serialization snapshot
    return {
      ...getSnapshot(self),
      file: self.file
    }
  },
  get title() {
    return self.tags.title;
  },
  get url() {
    return URL.createObjectURL(self.file);
  },
}));

const Book = model({
  title: optional(string, ''),
  currentChapterIndex: optional(number, 0),
  currentChapterTime: optional(number, 0),
  chapters: array(Chapter),
})
.actions(self => ({
  initChapters(chapters) {
    self.chapters = map(chapters, chapter => {
      const c = Chapter.create({});
      c.setFile(chapter);
      return c;
    });
    console.log(`self.chapters`, self.chapters);
  },
  setCurrentChapterIndex(currentChapterIndex) {
    self.currentChapterIndex = currentChapterIndex;
  },
  setCurrentChapterTime(currentChapterTime) {
    self.currentChapterTime = currentChapterTime;
  },
}))
.views(self => ({
  get snapshot() {
    return {
      ...getSnapshot(self),
      chapters: map(self.chapters, 'snapshot') // Override the chapters with custom snapshot we made
    }
  },
  get ready() {
    return every(self.chapters, 'ready');
  },
  get totalDuration() {
    return sumBy(self.chapters, 'duration');
  },
  get currentChapter() {
    return self.chapters[self.currentChapterIndex];
  },
}))

const Controller = model('AppController', {
  playbackRate: 1,
  currentBookIndex: optional(number, -1),
  books: array(Book),
})
.volatile(() => ({
  audioElement: null,
}))
.actions(self => ({
  afterCreate() {
    self.init();
  },
  init: flow(function* init() {
    // Restore books and chapters
    const state = yield localForage.getItem('state') || {};
    if (state) {
    applySnapshot(self, omit(state, 'books'));
    self.books = map(state.books, restoreBook => {
      const book = Book.create(restoreBook);
      book.initChapters(map(restoreBook.chapters, 'file'));
      return book;
    });
    }

    reaction(
      () => [self.snapshot],
      snapshot => localForage.setItem('state', ...snapshot),
      { delay: 500 }
    );
  }),
  setCurrentBookIndex(currentBookIndex) {
    self.currentBookIndex = currentBookIndex;
  },
  setChapters(chapters) {
    const book = Book.create({ title: `New Book ${self.books.length + 1}`});
    book.initChapters(chapters);
    self.books.push(book);
  },
  setAudioElement(audioElement) {
    self.audioElement = audioElement;
  },
  async playChapter(chapter, i) {
    self.currentBook.setCurrentChapterIndex(i);
    when(
      () => chapter.ready,
      () => {
        self.audioElement.src = chapter.url;
        self.audioElement.play();
        self.setPlaybackRate(self.playbackRate);
        window.document.title = chapter.title;
      }
    );
  },
  setPlaybackRate(playbackRate) {
    self.playbackRate = playbackRate;
    self.audioElement.playbackRate = playbackRate;
  },
  adjustPlaybackRate(adjustment) {
    self.setPlaybackRate(self.playbackRate + adjustment)
  }
}))
.views(self => ({
  get snapshot() {
    return {
      ...getSnapshot(self),
      books: map(self.books, 'snapshot'),
    }
  },
  get currentBook() {
    console.log(`self.currentBookIndex`, self.currentBookIndex);
    return self.books[self.currentBookIndex];
  }
}))

class App extends React.PureComponent {
  constructor(props) {
    super(props);
    this.c = Controller.create({})
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
        {map(this.c.books, (book, i) => (
          book.ready && (
            <div onClick={() => this.c.setCurrentBookIndex(i)}>
              {book.title}
            </div>
          )
        ))}



        
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

export default observer(App);
