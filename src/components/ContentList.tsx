type ContentListProps = {
  itemCount?: number;
};

export default function ContentList({ itemCount = 5 }: ContentListProps) {
  return (
    <ul className="wish-list">
      {Array.from({ length: itemCount }, (_, index) => (
        <li key={index}>
          <div className="wish-item">
            <span className="wish-emoji" aria-hidden />
            <span className="wish-title" />
            <span className="wish-check" />
          </div>
        </li>
      ))}
    </ul>
  );
}
